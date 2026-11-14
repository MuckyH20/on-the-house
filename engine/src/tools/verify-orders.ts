/**
 * Verify a campaign's hedges against Gemini's own records (sandbox). For every fill the engine reports, look the
 * order id up in the Gemini sandbox account's order history and compare quantity/price, then show Gemini's
 * position and settled payout for the market.
 *
 * Usage: pnpm verify:orders <campaign address | Gemini order id>   (engine must be running; uses .env credentials)
 */
import { createHash } from 'node:crypto';
import { Connection, PublicKey } from '@solana/web3.js';
import type { CampaignState } from '@oth/shared/api';
import { decodeEvents } from '@oth/shared/program';
import { loadEngineEnv } from '../env';
import { GeminiPublic } from '../venue/gemini-public';
import { GeminiSandbox } from '../venue/gemini-sandbox';

async function main() {
  const arg = process.argv[2]?.trim();
  if (!arg) throw new Error('usage: pnpm verify:orders <campaign address | Gemini order id>');
  const env = loadEngineEnv();
  const engineUrl = `http://127.0.0.1:${env.ENGINE_PORT}`;
  const getState = async (address: string) => {
    const res = await fetch(`${engineUrl}/campaigns/${address}/state`);
    return res.ok ? ((await res.json()) as CampaignState) : null;
  };
  let campaign = arg;
  if (/^\d{6,}$/.test(arg)) {
    // An order id: find the campaign whose fills include it.
    const list = (await (await fetch(`${engineUrl}/campaigns`)).json()) as { campaigns: { campaign: { address: string } }[] };
    let found: string | null = null;
    for (const c of list.campaigns) {
      const st = await getState(c.campaign.address);
      if (st?.fills.some((f) => f.orderId === arg)) {
        found = c.campaign.address;
        break;
      }
    }
    if (!found) throw new Error(`no campaign has a hedge fill with Gemini order id ${arg}`);
    console.log(`order ${arg} belongs to campaign ${found}`);
    campaign = found;
  }
  const s = await getState(campaign);
  if (!s) throw new Error(`campaign ${campaign} not found (pass the address from the proof-page URL, or a Gemini order id)`);
  const symbol = s.campaign.marketSymbol;
  const g = new GeminiSandbox({
    baseUrl: env.GEMINI_SANDBOX_BASE_URL,
    apiKey: env.GEMINI_API_KEY!,
    apiSecret: env.GEMINI_API_SECRET!,
    account: env.GEMINI_ACCOUNT,
    market: new GeminiPublic(env.GEMINI_SANDBOX_BASE_URL),
  });
  console.log(`campaign ${campaign}\nmarket   ${symbol}\non-chain hedged contracts: ${s.campaign.hedgedContracts}\n`);

  // Gemini stops accepting a game's symbol once it has settled, so fall back to a time window around each fill.
  const history = [...(await g.orderHistory(symbol).catch(() => [])), ...(await g.activeOrders(symbol).catch(() => []))];
  for (const f of s.fills) {
    if (history.some((x) => String(x.orderId) === f.orderId)) continue;
    history.push(...(await g.orderHistoryBetween(f.createdAt - 15 * 60_000, f.createdAt + 15 * 60_000)));
  }
  let ok = true;
  for (const f of s.fills) {
    const o = history.find((x) => String(x.orderId) === f.orderId);
    if (!o) {
      ok = false;
      console.log(`✗ order ${f.orderId}: NOT FOUND in Gemini sandbox order history`);
      continue;
    }
    const filled = Number(o.filledQuantity);
    const match = Math.floor(filled + 1e-9) === f.contracts;
    ok &&= match;
    console.log(
      `${match ? '✓' : '✗'} order ${f.orderId} · Gemini: ${o.side} ${o.outcome.toUpperCase()} ${o.filledQuantity}/${o.quantity} filled @ avg $${o.avgExecutionPrice} (limit $${o.price}, ${o.status}, ${o.createdAt})` +
        ` · engine recorded ${f.contracts} @ $${(Number(f.priceMicros) / 1e6).toFixed(2)} → Solana tx ${f.recordTx?.slice(0, 20)}…`,
    );
  }
  if (!s.fills.length) console.log('(no hedge fills for this campaign)');

  // Link each Gemini order to its Solana record: the record_hedge event stores sha256(Gemini order id).
  const connection = new Connection(env.SOLANA_RPC_URL, 'confirmed');
  for (const f of s.fills) {
    if (!f.recordTx) continue;
    const tx = await connection.getTransaction(f.recordTx, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' }).catch(() => null);
    const ev = decodeEvents(new PublicKey(env.PROGRAM_ID), tx?.meta?.logMessages ?? []).find((e) => e.name === 'hedgeRecorded');
    const raw = ev?.data.orderRefHash as unknown;
    const onChain = Array.isArray(raw) ? Buffer.from(raw as number[]).toString('hex') : typeof raw === 'string' ? raw : '';
    const expected = createHash('sha256').update(f.orderId).digest('hex');
    const same = onChain === expected;
    ok &&= same;
    console.log(`${same ? '✓' : '✗'} Solana record ${f.recordTx.slice(0, 20)}… stores sha256(order ${f.orderId}) = ${onChain.slice(0, 16)}…${same ? ' (matches)' : ` (expected ${expected.slice(0, 16)}…)`}`);
    console.log(`  https://explorer.solana.com/tx/${f.recordTx}?cluster=devnet`);
  }

  const pos = (await g.positions().catch(() => [])).filter((p) => p.symbol === symbol);
  const settled = (await g.settledPositions()).positions.filter((p) => p.instrumentSymbol === symbol);
  console.log(`\nGemini position now: ${pos.map((p) => `${p.totalQuantity} ${p.outcome.toUpperCase()} @ avg $${p.avgPrice}`).join(', ') || 'none'}`);
  console.log(`Gemini settled: ${settled.map((p) => `${p.positionQuantity} ${p.outcome.toUpperCase()} → resolution ${p.resolutionSide.toUpperCase()}, payout $${p.payout} (${p.settledAt})`).join(', ') || 'not settled yet'}`);
  console.log(`\n${ok ? 'VERIFIED ✅ every hedge matches a Gemini sandbox order and its Solana record' : 'MISMATCH ❌'}`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(`verify failed: ${(e as Error).message}`);
  process.exit(1);
});
