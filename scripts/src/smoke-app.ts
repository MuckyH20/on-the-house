/**
 * Smoke test of the web app's API routes, the way the browser uses them (needs `pnpm dev:engine` + `pnpm dev:app`):
 *   /api/campaigns (launch on a live Gemini market, SIMULATED hedging) → /api/faucet (burner) →
 *   GET+POST /api/pay (Solana Pay transaction request) → burner signs + sends → engine coverage → /wallets claims.
 * Usage: pnpm smoke:app   (APP_URL defaults to http://localhost:3000)
 */
import { strict as assert } from 'node:assert';
import { Connection, Keypair, Transaction } from '@solana/web3.js';
import { formatUsd, wsUrlFor } from '@oth/shared';
import type { CampaignState, MarketSummary, WalletClaim } from '@oth/shared/api';
import { findRepoRoot, loadDotEnv } from '@oth/shared/node';

process.chdir(findRepoRoot());
loadDotEnv(process.env.ENV_FILE || '.env');
const APP = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
const ENGINE = (process.env.PUBLIC_ENGINE_URL || 'http://localhost:8787').replace(/\/$/, '');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${url} → ${res.status}: ${body.error}`);
  return body;
}

async function main() {
  const rpc = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const connection = new Connection(rpc, { commitment: 'confirmed', wsEndpoint: wsUrlFor(rpc) });

  // A live Gemini market that closes ≥ 30 min from now (so it can't settle mid-test).
  const { markets } = await j<{ markets: MarketSummary[] }>(`${ENGINE}/markets?limit=500`);
  const soon = new Date(Date.now() + 30 * 60_000).toISOString();
  const m = markets.find((x) => x.source === 'gemini' && x.yesAsk && Number(x.yesAsk) < 0.7 && (!x.closesAt || x.closesAt > soon)) ?? markets.find((x) => x.simulated)!;
  console.log(`market: ${m.title} (${m.symbol}) ask ${m.yesAsk}`);
  const costPct = Math.min(100, Math.ceil(Number(m.yesAsk) * 100 * 1.1 * 1.5));

  const { campaign } = await j<{ campaign: string }>(`${APP}/api/campaigns`, {
    method: 'POST',
    body: JSON.stringify({ marketSymbol: m.symbol, refundPct: 100, maxCostPct: costPct, liabilityCapUsd: 100, maxUnhedgedUsd: 10, deadlineMinutes: 30 }),
  });
  console.log(`campaign ${campaign} (max cost ${costPct}%)`);

  const burner = Keypair.generate();
  const f = await j<{ message: string }>(`${APP}/api/faucet`, { method: 'POST', body: JSON.stringify({ wallet: burner.publicKey.toBase58() }) });
  console.log(`faucet: ${f.message}`);
  const again = await fetch(`${APP}/api/faucet`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ wallet: burner.publicKey.toBase58() }) });
  assert.equal(again.status, 429, 'faucet is rate-limited per wallet');

  const meta = await j<{ label: string; icon: string }>(`${APP}/api/pay/${campaign}`);
  assert.ok(meta.label && meta.icon, 'GET returns label + icon');
  const pay = await j<{ transaction: string; message: string; refund: string; premium: string }>(`${APP}/api/pay/${campaign}?amount=4.50&item=Oat%20latte`, {
    method: 'POST',
    body: JSON.stringify({ account: burner.publicKey.toBase58() }),
  });
  console.log(`pay: "${pay.message}" (premium ${formatUsd(pay.premium)})`);
  const tx = Transaction.from(Buffer.from(pay.transaction, 'base64'));
  assert.ok(tx.signatures[0]!.signature, 'operator (fee payer) pre-signed');
  tx.partialSign(burner);
  const sig = await connection.sendRawTransaction(tx.serialize());
  // Wait until confirmed or the blockhash expires (a fixed 30 s timeout is too short on a busy devnet).
  const res = await connection.confirmTransaction(
    { signature: sig, blockhash: tx.recentBlockhash!, lastValidBlockHeight: (await connection.getBlockHeight('confirmed')) + 150 },
    'confirmed',
  );
  if (res.value.err) throw new Error(`purchase failed: ${JSON.stringify(res.value.err)}`);
  console.log(`purchase ${sig}`);
  await fetch(`${ENGINE}/campaigns/${campaign}/kick`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });

  let s: CampaignState | null = null;
  for (let i = 0; i < 60; i++) {
    s = await j<CampaignState>(`${ENGINE}/campaigns/${campaign}/state`);
    if (s.coverageBps >= 10_000 && BigInt(s.campaign.liability) > 0n && s.hedger.pendingContracts === 0) break;
    await sleep(1000);
  }
  assert.ok(s && s.coverageBps >= 10_000, 'covered');
  console.log(`coverage ${s!.coverageBps / 100}% · promised ${formatUsd(s!.promised)} · fill ${s!.fills[0]?.contracts}@${s!.fills[0]?.priceMicros} (${s!.fills[0]?.orderId})`);

  const claims = await j<{ claims: WalletClaim[] }>(`${ENGINE}/wallets/${burner.publicKey.toBase58()}/claims`);
  assert.equal(claims.claims[0]?.claimBalance, pay.refund, 'claim balance = refund');
  console.log(`claims: ${formatUsd(claims.claims[0]!.claimBalance)} owed if "${claims.claims[0]!.market?.condition}"`);
  console.log(`\nAPP SMOKE PASSED ✅  open ${APP}/proof/${campaign}`);
}

main().catch((e) => {
  console.error(`APP SMOKE FAILED ❌ ${(e as Error).message}`);
  process.exit(1);
});
