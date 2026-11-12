/**
 * Live check of the Gemini SANDBOX trading client (test funds only): buys 1 YES contract IOC on a liquid sandbox
 * market at its ask, then reads back order history and positions. Usage: pnpm --filter @oth/engine sandbox:test
 */
import { priceToMicros } from '@oth/shared';
import { loadEngineEnv } from '../env';
import { GeminiPublic } from '../venue/gemini-public';
import { GeminiSandbox } from '../venue/gemini-sandbox';

async function main() {
  const env = loadEngineEnv();
  const pub = new GeminiPublic(env.GEMINI_SANDBOX_BASE_URL);
  const g = new GeminiSandbox({ baseUrl: env.GEMINI_SANDBOX_BASE_URL, apiKey: env.GEMINI_API_KEY!, apiSecret: env.GEMINI_API_SECRET!, account: env.GEMINI_ACCOUNT, market: pub });
  console.log('terms:', JSON.stringify(await g.assertReady()));
  const soon = new Date(Date.now() + 20 * 60_000).toISOString();
  const m = (await pub.listMarkets()).find((x) => x.yesAsk && Number(x.yesAsk) >= 0.15 && Number(x.yesAsk) <= 0.85 && (x.closesAt ?? '9') > soon);
  if (!m) throw new Error('no liquid sandbox market found');
  const q = await g.quote(m.symbol);
  console.log(`market: ${m.title} (${m.symbol}) ask ${m.yesAsk} tick ${q.tickMicros}`);
  const res = await g.buyYes({ symbol: m.symbol, contracts: 1, limitPriceMicros: q.askMicros! , clientOrderId: `probe-${Date.now()}` });
  console.log('order result:', { ...res, avgPriceMicros: res.avgPriceMicros.toString() });
  const hist = (await g.orderHistory(m.symbol)).slice(0, 2);
  console.log('order history (latest):', JSON.stringify(hist.map((o) => ({ orderId: o.orderId, status: o.status, qty: o.quantity, filled: o.filledQuantity, price: o.price, avg: o.avgExecutionPrice }))));
  const pos = (await g.positions()).filter((p) => p.symbol === m.symbol);
  console.log('position:', JSON.stringify(pos.map((p) => ({ symbol: p.symbol, outcome: p.outcome, qty: p.totalQuantity, avg: p.avgPrice }))));
  void priceToMicros;
}
main().catch((e) => {
  console.error('sandbox test failed:', (e as Error).message);
  process.exit(1);
});
