import { createPublicKey, verify } from 'node:crypto';
import bs58 from 'bs58';
import { z } from 'zod';
import { shopSaveMessage, type ShopItem, type ShopProfile } from '@oth/shared/api';

/**
 * Shop profiles (name + menu) are public, but only the merchant wallet may change them: every save carries an
 * ed25519 signature over shopSaveMessage(...) made by that wallet (a Privy embedded wallet in the app).
 */

const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
export const MAX_SKEW_MS = 5 * 60_000;

export function verifyEd25519(pubkeyBase58: string, message: string, signatureBase58: string): boolean {
  try {
    const raw = Buffer.from(bs58.decode(pubkeyBase58));
    if (raw.length !== 32) return false;
    const key = createPublicKey({ key: Buffer.concat([SPKI_ED25519_PREFIX, raw]), format: 'der', type: 'spki' });
    return verify(null, Buffer.from(message, 'utf8'), key, Buffer.from(bs58.decode(signatureBase58)));
  } catch {
    return false;
  }
}

const usd = z.string().regex(/^\d{1,12}$/, 'price must be USDC base units');
export const ShopSaveBody = z.object({
  name: z.string().trim().min(1, 'Shop name is required').max(60),
  items: z
    .array(z.object({ id: z.string().min(1).max(40), name: z.string().trim().min(1).max(40), price: usd }))
    .min(1, 'Add at least one item')
    .max(30),
  timestamp: z.number().int(),
  signature: z.string().min(40).max(120),
});

export function checkShopSave(merchant: string, body: unknown, now = Date.now()): { ok: true; profile: ShopProfile } | { ok: false; error: string } {
  const parsed = ShopSaveBody.safeParse(body);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  const { name, items, timestamp, signature } = parsed.data;
  if (Math.abs(now - timestamp) > MAX_SKEW_MS) return { ok: false, error: 'signature expired — try again' };
  for (const it of items) if (BigInt(it.price) <= 0n || BigInt(it.price) > 100_000_000n) return { ok: false, error: `"${it.name}" must cost between $0.01 and $100` };
  const message = shopSaveMessage(merchant, name, items as ShopItem[], timestamp);
  if (!verifyEd25519(merchant, message, signature)) return { ok: false, error: 'signature does not match this wallet' };
  return { ok: true, profile: { merchant, name, items: items as ShopItem[], updatedAt: now } };
}
