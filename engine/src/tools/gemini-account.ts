/**
 * What our Gemini SANDBOX account holds and did, straight from Gemini (read-only, never trades):
 * balance, open positions, settled positions with payouts, and recent orders matched to the promo that placed them
 * (via the Gemini order ids the engine records for each promo).
 *
 * Usage: pnpm gemini:account [days=7]   (uses the .env Gemini credentials; promo links use PUBLIC_ENGINE_URL / APP_URL)
 */
import { loadEngineEnv } from '../env';
import { GeminiPublic } from '../venue/gemini-public';
import { GeminiSandbox, type GeminiOrder } from '../venue/gemini-sandbox';

const usd = (v: string | number | null | undefined) => (v == null || v === '' ? '—' : `$${Number(v).toFixed(2)}`);
const when = (t: string | number) => new Date(typeof t === 'number' ? t : Date.parse(t)).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const pad = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n));

async function main() {
  const days = Math.max(1, Number(process.argv[2]) || 7);
  const env = loadEngineEnv();
  if (!env.GEMINI_API_KEY || !env.GEMINI_API_SECRET) throw new Error('GEMINI_API_KEY / GEMINI_API_SECRET are not set in .env');
  const g = new GeminiSandbox({
    baseUrl: env.GEMINI_SANDBOX_BASE_URL,
    apiKey: env.GEMINI_API_KEY,
    apiSecret: env.GEMINI_API_SECRET,
    account: env.GEMINI_ACCOUNT,
    market: new GeminiPublic(env.GEMINI_SANDBOX_BASE_URL),
  });
  const engineUrl = env.PUBLIC_ENGINE_URL.replace(/\/$/, '');
  const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');

  console.log(`Gemini SANDBOX account (test funds) · ${env.GEMINI_SANDBOX_BASE_URL}\nOn the web: https://exchange.sandbox.gemini.com/predictions\n`);

  const balances = await g.private<{ currency: string; amount: string; available: string }[]>('/v1/balances').catch(() => []);
  const cash = balances.find((b) => b.currency === 'USD');
  console.log(`Balance: ${cash ? `${usd(cash.available)} available (${usd(cash.amount)} total)` : 'unavailable'}\n`);

  const open = await g.positions().catch(() => []);
  console.log(`Open positions (${open.length})`);
  for (const p of open) console.log(`  ${pad(p.symbol, 34)} ${p.outcome.toUpperCase().padEnd(3)} ${p.totalQuantity.padStart(5)} @ ${usd(p.avgPrice)}  value ${usd(p.marketValue)}`);
  if (!open.length) console.log('  none');

  const settled = await g.settledPositions().catch(() => ({ positions: [], totalPayout: undefined }));
  const total = settled.totalPayout ?? settled.positions.reduce((s, p) => s + Number(p.payout), 0);
  console.log(`\nSettled positions (${settled.positions.length}) · Gemini paid out ${usd(total)} in total`);
  for (const p of [...settled.positions].sort((a, b) => Date.parse(b.settledAt) - Date.parse(a.settledAt)).slice(0, 25)) {
    console.log(`  ${pad(when(p.settledAt), 15)} ${pad(p.instrumentSymbol, 34)} ${p.positionQuantity.padStart(4)} × ${p.outcome.toUpperCase().padEnd(3)} result ${p.resolutionSide.toUpperCase().padEnd(3)} paid ${usd(p.payout)}`);
  }

  const now = Date.now();
  const orders: GeminiOrder[] = [...(await g.orderHistoryBetween(now - days * 86_400_000, now).catch(() => [])), ...(await g.activeOrders().catch(() => []))];
  // Which promo placed each order: the engine records every fill's Gemini order id on the promo.
  const promoOf = await promosByOrder(engineUrl, new Set(orders.map((o) => o.symbol)));
  console.log(`\nOrders in the last ${days} day${days === 1 ? '' : 's'} (${orders.length})`);
  for (const o of orders.sort((a, b) => Date.parse(String(b.createdAt)) - Date.parse(String(a.createdAt)))) {
    const promo = promoOf.get(String(o.orderId));
    const filled = Number(o.filledQuantity);
    // Our orders are immediate-or-cancel, so Gemini marks them "cancelled" once done; say what happened instead.
    const result = o.status === 'open' ? 'open' : filled === 0 ? 'not filled' : filled < Number(o.quantity) ? 'partly filled' : 'filled';
    const fill = `${o.filledQuantity}/${o.quantity}`;
    console.log(`  ${pad(when(o.createdAt), 15)} #${String(o.orderId)}  ${pad(o.symbol, 30)} ${o.side} ${o.outcome.toUpperCase()} ${fill.padStart(5)} @ ${usd(o.avgExecutionPrice ?? o.price)}  ${result}`);
    if (promo) console.log(`      promo ${promo}${appUrl ? `  →  ${appUrl}/proof/${promo}` : ''}`);
  }
  if (!orders.length) console.log('  none (the sandbox only has sellers about an hour before a game ends, so most promos use practice games)');
  console.log(`\nCheck one promo's hedges against these records: pnpm verify:orders <promo address>`);
}

/** Gemini order id → promo address, from each real-market promo's recorded fills on the engine. */
async function promosByOrder(engineUrl: string, symbols: Set<string>): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const get = <T>(path: string) => fetch(`${engineUrl}${path}`, { signal: AbortSignal.timeout(15_000) }).then((r) => (r.ok ? (r.json() as Promise<T>) : null)).catch(() => null);
  const list = await get<{ campaigns: { campaign: { address: string; marketSymbol: string } }[] }>('/campaigns');
  const relevant = (list?.campaigns ?? []).map((c) => c.campaign).filter((c) => symbols.has(c.marketSymbol));
  for (let i = 0; i < relevant.length; i += 6) {
    await Promise.all(
      relevant.slice(i, i + 6).map(async (c) => {
        const st = await get<{ fills: { orderId: string }[] }>(`/campaigns/${c.address}/state`);
        for (const f of st?.fills ?? []) out.set(String(f.orderId), c.address);
      }),
    );
  }
  return out;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
