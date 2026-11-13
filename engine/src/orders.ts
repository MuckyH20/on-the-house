import { z } from 'zod';
import { orderStatusMessage, type OrderLine, type OrderStatus, type ShopOrder, type ShopProfile } from '@oth/shared/api';
import { decodeEvents } from '@oth/shared/program';
import type { Repo } from './db';
import { MAX_SKEW_MS, verifyEd25519 } from './shops';
import type { Chain } from './solana';

/**
 * Orders = the on-chain purchase (payment, refund claim) + what was ordered + pickup status, so a shop's staff can
 * work from a normal order list. Items are attached by the customer's app right after paying; we only accept them if
 * the purchase transaction exists on-chain for this campaign and the items add up to exactly the amount paid at the
 * shop's menu prices. Only the shop's wallet can change the status.
 */

export const AttachBody = z.object({
  signature: z.string().min(60).max(100),
  items: z.array(z.object({ id: z.string().min(1).max(40), qty: z.number().int().min(1).max(50) })).min(1).max(30),
});

export async function attachOrder(chain: Chain, repo: Repo, body: unknown): Promise<{ ok: true; order: ShopOrder } | { ok: false; status: number; error: string }> {
  const parsed = AttachBody.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, error: parsed.error.issues.map((i) => i.message).join('; ') };
  const { signature, items } = parsed.data;
  const existing = repo.getOrder(signature);
  if (existing) return { ok: true, order: existing };

  // The payment must be on-chain (it was confirmed before the app calls us; allow a little propagation time).
  let logs: string[] | null = null;
  for (let i = 0; i < 6 && !logs; i++) {
    const tx = await chain.connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 }).catch(() => null);
    if (tx?.meta && !tx.meta.err) logs = tx.meta.logMessages ?? [];
    else await new Promise((r) => setTimeout(r, 1000));
  }
  if (!logs) return { ok: false, status: 404, error: 'payment not found on-chain' };
  const purchase = decodeEvents(chain.programId, logs).find((e) => e.name === 'purchaseEvent');
  if (!purchase) return { ok: false, status: 400, error: 'transaction is not a purchase' };
  const campaign = String(purchase.data.campaign);

  // Items must match the shop's menu and add up to the amount paid.
  const c = await chain.program.account.campaign.fetchNullable(campaign, 'confirmed').catch(() => null);
  const merchant = c ? (c as unknown as { merchant: { toBase58(): string } }).merchant.toBase58() : null;
  const shop: ShopProfile | null = merchant ? repo.getShop(merchant) : null;
  const menu = new Map((shop?.items ?? []).map((m) => [m.id, m]));
  const lines: OrderLine[] = [];
  let total = 0n;
  for (const it of items) {
    const m = menu.get(it.id);
    if (!m) return { ok: false, status: 400, error: `"${it.id}" is not on this shop's menu` };
    lines.push({ id: m.id, name: m.name, qty: it.qty, price: m.price });
    total += BigInt(m.price) * BigInt(it.qty);
  }
  if (total !== BigInt(String(purchase.data.amount))) return { ok: false, status: 400, error: 'items do not match the amount paid' };

  const now = Date.now();
  const order: ShopOrder = {
    signature,
    campaign,
    buyer: String(purchase.data.buyer),
    amount: String(purchase.data.amount),
    refund: String(purchase.data.refund),
    lines,
    status: 'new',
    createdAt: now,
    updatedAt: now,
  };
  repo.saveOrder(order);
  return { ok: true, order };
}

export const StatusBody = z.object({
  status: z.enum(['new', 'ready', 'done']),
  timestamp: z.number().int(),
  signature: z.string().min(40).max(120),
});

export async function setOrderStatus(chain: Chain, repo: Repo, orderSig: string, body: unknown): Promise<{ ok: true; order: ShopOrder } | { ok: false; status: number; error: string }> {
  const parsed = StatusBody.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, error: parsed.error.issues.map((i) => i.message).join('; ') };
  const order = repo.getOrder(orderSig);
  if (!order) return { ok: false, status: 404, error: 'order not found' };
  if (Math.abs(Date.now() - parsed.data.timestamp) > MAX_SKEW_MS) return { ok: false, status: 400, error: 'signature expired — try again' };
  const c = await chain.program.account.campaign.fetchNullable(order.campaign, 'confirmed').catch(() => null);
  const merchant = c ? (c as unknown as { merchant: { toBase58(): string } }).merchant.toBase58() : null;
  if (!merchant) return { ok: false, status: 404, error: 'promo not found' };
  const msg = orderStatusMessage(merchant, orderSig, parsed.data.status as OrderStatus, parsed.data.timestamp);
  if (!verifyEd25519(merchant, msg, parsed.data.signature)) return { ok: false, status: 403, error: 'only the shop can update this order' };
  const next: ShopOrder = { ...order, status: parsed.data.status as OrderStatus, updatedAt: Date.now() };
  repo.saveOrder(next);
  return { ok: true, order: next };
}
