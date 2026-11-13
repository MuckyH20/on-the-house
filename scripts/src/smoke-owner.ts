/**
 * Smoke test of the self-custody owner path (what a Privy embedded wallet does in the browser), with a local
 * keypair standing in for the owner's wallet:
 *   1. sign + save the shop profile (engine PUT /shops/:wallet)
 *   2. launch a promo: /api/campaigns with `merchant` → owner co-signs → /api/submit
 *   3. the promo shows up under that owner, with the shop's menu
 * Usage: pnpm smoke:owner   (needs pnpm dev:engine + pnpm dev:app, and a market that can be protected)
 */
import { strict as assert } from 'node:assert';
import { Keypair, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { shopSaveMessage, type CampaignSummary, type MarketSummary, type ShopProfile } from '@oth/shared/api';
import { findRepoRoot, loadDotEnv } from '@oth/shared/node';

process.chdir(findRepoRoot());
loadDotEnv(process.env.ENV_FILE || '.env');
const APP = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
const ENGINE = (process.env.PUBLIC_ENGINE_URL || 'http://localhost:8787').replace(/\/$/, '');

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${url} → ${res.status}: ${body.error}`);
  return body;
}

async function main() {
  const owner = Keypair.generate(); // stands in for the Privy embedded wallet
  const address = owner.publicKey.toBase58();
  const signText = (t: string) => bs58.encode(nacl.sign.detached(new TextEncoder().encode(t), owner.secretKey));

  // 1. shop profile, signed by the owner
  const items = [
    { id: 'latte', name: 'Latte', price: '4500000' },
    { id: 'bagel', name: 'Bagel', price: '3000000' },
  ];
  const timestamp = Date.now();
  const shop = await j<ShopProfile>(`${ENGINE}/shops/${address}`, {
    method: 'PUT',
    body: JSON.stringify({ name: 'Smoke Test Diner', items, timestamp, signature: signText(shopSaveMessage(address, 'Smoke Test Diner', items, timestamp)) }),
  });
  assert.equal(shop.name, 'Smoke Test Diner');
  console.log(`shop saved for owner ${address.slice(0, 8)}…`);

  // 2. launch, co-signed by the owner
  const { markets } = await j<{ markets: MarketSummary[] }>(`${ENGINE}/markets?limit=500`);
  const soon = Date.now() + 25 * 60_000;
  const m = markets.find((x) => x.yesAsk && Number(x.yesAsk) >= 0.1 && Number(x.yesAsk) <= 0.7 && (!x.closesAt || Date.parse(x.closesAt) > soon));
  if (!m) throw new Error('no market can be protected right now (sandbox liquidity) — try again shortly or use mock mode');
  const built = await j<{ campaign: string; transaction: string }>(`${APP}/api/campaigns`, {
    method: 'POST',
    body: JSON.stringify({ merchant: address, marketSymbol: m.symbol, refundPct: 50, maxCostPct: 60, liabilityCapUsd: 50, maxUnhedgedUsd: 10, deadlineMinutes: 20 }),
  });
  assert.ok(built.transaction, 'owner launches get a transaction to co-sign');
  const tx = Transaction.from(Buffer.from(built.transaction, 'base64'));
  tx.partialSign(owner);
  const { signature } = await j<{ signature: string }>(`${APP}/api/submit`, {
    method: 'POST',
    body: JSON.stringify({ transaction: tx.serialize().toString('base64') }),
  });
  console.log(`launched ${built.campaign} on ${m.title} · ${signature.slice(0, 16)}…`);

  // a transaction not co-signed by the owner must be refused
  const unsigned = await fetch(`${APP}/api/submit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ transaction: built.transaction }) });
  assert.equal(unsigned.status, 400, 'submit refuses a transaction missing the owner signature');

  // 3. it's the owner's promo
  await fetch(`${ENGINE}/campaigns/${built.campaign}/state`); // as the app does after launching
  const mine = await j<{ campaigns: CampaignSummary[] }>(`${ENGINE}/campaigns?merchant=${address}`);
  assert.equal(mine.campaigns.length, 1);
  assert.equal(mine.campaigns[0]!.campaign.address, built.campaign);
  assert.equal(mine.campaigns[0]!.campaign.merchant, address);
  console.log(`\nOWNER SMOKE PASSED ✅  ${APP}/p/${built.campaign}`);
}

main().catch((e) => {
  console.error(`OWNER SMOKE FAILED ❌ ${(e as Error).message}`);
  process.exit(1);
});
