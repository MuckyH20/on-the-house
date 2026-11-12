/**
 * Live demo with NOTHING simulated on the Gemini side (needs the engine in GEMINI_MODE=sandbox,
 * RESOLUTION_SOURCE=sandbox, plus `pnpm dev:app`):
 *   1. launch a promo (via the app API) on a Gemini SANDBOX market that settles in ~8–25 min
 *   2. a burner wallet buys through the Solana Pay endpoint → the engine hedges with a real sandbox order
 *   3. wait for Gemini to settle the market → the engine settles on Solana and pays refunds if YES
 *   4. check: refund paid ⇔ Gemini resolved YES; Gemini's own settled-position payout is shown alongside
 * Usage: pnpm demo:sandbox   (MIN_MINUTES / MAX_MINUTES tune the market window)
 */
import { strict as assert } from 'node:assert';
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { formatUsd, wsUrlFor } from '@oth/shared';
import type { CampaignState, EngineInfo, MarketSummary } from '@oth/shared/api';
import { findRepoRoot, loadDotEnv } from '@oth/shared/node';

process.chdir(findRepoRoot());
loadDotEnv(process.env.ENV_FILE || '.env');
const APP = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
const ENGINE = (process.env.PUBLIC_ENGINE_URL || 'http://localhost:8787').replace(/\/$/, '');
const MIN_MIN = Number(process.env.MIN_MINUTES ?? 8);
const MAX_MIN = Number(process.env.MAX_MINUTES ?? 25);
/** Ask range to pick from. A high range (e.g. 0.80–0.95) makes a YES — and so a real Gemini payout — likely. */
const MIN_ASK = Number(process.env.MIN_ASK ?? 0.2);
const MAX_ASK = Number(process.env.MAX_ASK ?? 0.8);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const t = () => new Date().toLocaleTimeString();

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${url} → ${res.status}: ${body.error}`);
  return body;
}

async function main() {
  const info = await j<EngineInfo>(`${ENGINE}/health`);
  assert.equal(info.geminiMode, 'sandbox', 'start the engine with GEMINI_MODE=sandbox');
  assert.equal(info.resolutionSource, 'sandbox', 'start the engine with RESOLUTION_SOURCE=sandbox');
  const rpc = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const connection = new Connection(rpc, { commitment: 'confirmed', wsEndpoint: wsUrlFor(rpc) });

  const { markets } = await j<{ markets: MarketSummary[] }>(`${ENGINE}/markets?limit=500`);
  const lo = Date.now() + MIN_MIN * 60_000;
  const hi = Date.now() + MAX_MIN * 60_000;
  const m = markets.find((x) => x.closesAt && Date.parse(x.closesAt) >= lo && Date.parse(x.closesAt) <= hi && x.yesAsk && Number(x.yesAsk) >= MIN_ASK && Number(x.yesAsk) <= MAX_ASK);
  if (!m) throw new Error(`no sandbox market with a ${MIN_ASK}–${MAX_ASK} ask closing in ${MIN_MIN}–${MAX_MIN} min; try again in a few minutes`);
  const closesInMin = Math.round((Date.parse(m.closesAt!) - Date.now()) / 60_000);
  console.log(`[${t()}] market: ${m.title} · ask ${m.yesAsk} · closes in ${closesInMin} min (${m.symbol})`);

  const costPct = Math.min(100, Math.ceil(Number(m.yesAsk) * 100 * 1.1 * 1.4));
  const { campaign } = await j<{ campaign: string }>(`${APP}/api/campaigns`, {
    method: 'POST',
    body: JSON.stringify({ marketSymbol: m.symbol, refundPct: 100, maxCostPct: costPct, liabilityCapUsd: 50, maxUnhedgedUsd: 10, deadlineMinutes: Math.max(1, closesInMin - 1) }),
  });
  console.log(`[${t()}] promo ${campaign} · 100% back · max cost ${costPct}%`);

  const burner = Keypair.generate();
  await j(`${APP}/api/faucet`, { method: 'POST', body: JSON.stringify({ wallet: burner.publicKey.toBase58() }) });
  const pay = await j<{ transaction: string; refund: string; premium: string }>(`${APP}/api/pay/${campaign}?amount=3.00&item=Cold%20brew`, {
    method: 'POST',
    body: JSON.stringify({ account: burner.publicKey.toBase58() }),
  });
  const tx = Transaction.from(Buffer.from(pay.transaction, 'base64'));
  tx.partialSign(burner);
  const sig = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction(sig, 'confirmed');
  console.log(`[${t()}] customer paid $3.00 (premium ${formatUsd(pay.premium)}) → refund if YES ${formatUsd(pay.refund)}  tx ${sig.slice(0, 16)}…`);
  await fetch(`${ENGINE}/campaigns/${campaign}/kick`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });

  let s: CampaignState | null = null;
  for (let i = 0; i < 90; i++) {
    s = await j<CampaignState>(`${ENGINE}/campaigns/${campaign}/state`);
    if (s.coverageBps >= 10_000 && s.hedger.pendingContracts === 0 && BigInt(s.campaign.liability) > 0n) break;
    await sleep(2000);
  }
  assert.ok(s && s.coverageBps >= 10_000, `not covered: ${s?.hedger.lastError}`);
  const f = s!.fills[0]!;
  console.log(`[${t()}] hedged on Gemini SANDBOX: order ${f.orderId} · ${f.contracts} YES @ $${(Number(f.priceMicros) / 1e6).toFixed(2)} · recorded on Solana ${f.recordTx?.slice(0, 16)}…`);
  console.log(`[${t()}] Gemini position for ${m.symbol}: ${s!.venue?.positionContracts ?? '?'} YES`);

  const usdc = new PublicKey(info.usdcMint);
  const bal = async () => BigInt((await connection.getTokenAccountBalance(getAssociatedTokenAddressSync(usdc, burner.publicKey), 'confirmed')).value.amount);
  const before = await bal();
  console.log(`[${t()}] waiting for Gemini to settle the market (closes ${new Date(m.closesAt!).toLocaleTimeString()})…`);
  const deadline = Date.parse(m.closesAt!) + 30 * 60_000;
  while (Date.now() < deadline) {
    s = await j<CampaignState>(`${ENGINE}/campaigns/${campaign}/state`);
    if (s.campaign.status === 'settled' && s.settlement.state === 'done') break;
    await sleep(10_000);
  }
  assert.equal(s!.campaign.status, 'settled', 'Gemini did not settle the market within 30 min of close');
  const after = await bal();
  const outcome = s!.campaign.outcome;
  console.log(`[${t()}] Gemini resolved ${String(outcome).toUpperCase()} · Solana settled · customer received ${formatUsd(after - before)}`);
  if (outcome === 'yes') assert.equal(after - before, BigInt(pay.refund), 'YES → exact refund');
  else assert.equal(after, before, 'NO → nothing paid');
  for (let i = 0; i < 12 && !s!.venue?.settledPayout; i++) {
    await sleep(5_000);
    s = await j<CampaignState>(`${ENGINE}/campaigns/${campaign}/state`);
  }
  console.log(`[${t()}] Gemini settled-position payout for ${m.symbol}: ${s!.venue?.settledPayout != null ? `$${s!.venue.settledPayout}` : '(not reported yet)'} · resolution ${s!.venue?.resolutionSide ?? '?'}`);
  console.log(`\nSANDBOX DEMO PASSED ✅  ${APP}/proof/${campaign}`);
}

main().catch((e) => {
  console.error(`SANDBOX DEMO FAILED ❌ ${(e as Error).message}`);
  process.exit(1);
});
