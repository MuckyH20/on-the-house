import { strict as assert } from 'node:assert';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { GeminiPublic } from './gemini-public';
import { GeminiSandbox, SandboxOnlyError, toOrderResult, type GeminiOrder } from './gemini-sandbox';

const market = new GeminiPublic('https://api.sandbox.gemini.com');
const opts = { apiKey: 'account-test', apiSecret: 'secret', market };

test('refuses to be constructed for any non-sandbox host (safety)', () => {
  for (const baseUrl of ['https://api.gemini.com', 'https://api.gemini.com.evil.example', 'http://localhost:1234']) {
    assert.throws(() => new GeminiSandbox({ ...opts, baseUrl }), SandboxOnlyError);
  }
  assert.doesNotThrow(() => new GeminiSandbox({ ...opts, baseUrl: 'https://api.sandbox.gemini.com' }));
});

test('signs exactly as the Gemini docs describe (HMAC-SHA384 over the base64 payload)', async () => {
  const g = new GeminiSandbox({ ...opts, baseUrl: 'https://api.sandbox.gemini.com' });
  let seen: Headers | null = null;
  const orig = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    seen = new Headers(init?.headers);
    return new Response('{"ok":true}', { status: 200 });
  }) as typeof fetch;
  try {
    await g.private('/v1/prediction-markets/order/cancel', { orderId: '145853902317835601' });
  } finally {
    globalThis.fetch = orig;
  }
  const h = seen!;
  const payload = h.get('X-GEMINI-PAYLOAD')!;
  assert.equal(h.get('X-GEMINI-SIGNATURE'), createHmac('sha384', 'secret').update(payload).digest('hex'));
  assert.equal(h.get('X-GEMINI-APIKEY'), 'account-test');
  assert.equal(h.get('Content-Type'), 'text/plain');
  const json = Buffer.from(payload, 'base64').toString();
  assert.match(json, /"request":"\/v1\/prediction-markets\/order\/cancel"/);
  assert.match(json, /"orderId":145853902317835601[,}]/, '64-bit order id sent as an exact JSON number');
  assert.doesNotMatch(json, /"account"/, 'account-scoped keys send no account param');
});

test('master keys target the primary subaccount by default', async () => {
  const g = new GeminiSandbox({ ...opts, apiKey: 'master-test', baseUrl: 'https://api.sandbox.gemini.com' });
  let body = '';
  const orig = globalThis.fetch;
  globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
    body = Buffer.from(new Headers(init?.headers).get('X-GEMINI-PAYLOAD')!, 'base64').toString();
    return new Response('{"positions":[]}', { status: 200 });
  }) as typeof fetch;
  try {
    await g.positions();
  } finally {
    globalThis.fetch = orig;
  }
  assert.match(body, /"account":"primary"/);
});

const order = (o: Partial<GeminiOrder>): GeminiOrder => ({
  orderId: '1', status: 'cancelled', symbol: 'S', side: 'buy', outcome: 'yes', orderType: 'limit',
  quantity: '5', filledQuantity: '0', remainingQuantity: '5', price: '0.40', avgExecutionPrice: null, createdAt: '', ...o,
});

test('IOC results: full fill, partial (fractional floored), nothing', () => {
  // Real sandbox shape: a fully filled IOC order comes back as status "cancelled" with filledQuantity = quantity.
  const full = toOrderResult(order({ filledQuantity: '5', remainingQuantity: '0', avgExecutionPrice: '0.38' }), 'c');
  assert.deepEqual([full.state, full.filledContracts, full.avgPriceMicros], ['filled', 5, 380_000n]);
  const partial = toOrderResult(order({ filledQuantity: '2.37', avgExecutionPrice: '0.40' }), 'c');
  assert.deepEqual([partial.state, partial.filledContracts], ['rejected', 2]);
  const none = toOrderResult(order({}), 'c');
  assert.deepEqual([none.state, none.filledContracts, none.avgPriceMicros], ['rejected', 0, 0n]);
});

test('a momentary gap in asks reuses the last real quote; a closed market does not', async () => {
  let contract: unknown = { status: 'active', marketState: 'open', priceIncrement: '0.01', prices: { bestAsk: '0.23', bestBid: '0.03' } };
  const fakeMarket = { getContract: async () => contract } as unknown as GeminiPublic;
  const g = new GeminiSandbox({ ...opts, market: fakeMarket, baseUrl: 'https://api.sandbox.gemini.com' });
  assert.equal((await g.quote('GEMI-X')).askMicros, 230_000n);
  contract = { status: 'active', marketState: 'open', prices: {} }; // market maker re-posting: no asks for a moment
  assert.equal((await g.quote('GEMI-X')).askMicros, 230_000n, 'grace window keeps the last real ask');
  contract = null; // event fetch failed
  assert.equal((await g.quote('GEMI-X')).askMicros, 230_000n, 'transport blip also uses the grace window');
  contract = { status: 'settled', prices: {} };
  assert.equal((await g.quote('GEMI-X')).askMicros, null, 'a closed market is never quoted');
  assert.equal((await g.quote('GEMI-NEVER-SEEN')).askMicros, null, 'no history → no quote');
});

test('a game with no sellers is not quoted, even though Gemini repeats the last trade as buy.yes', async () => {
  const contract = { status: 'active', marketState: 'open', priceIncrement: '0.01', prices: { buy: { yes: '0.32' }, bestBid: '0.02', lastTradePrice: '0.32' } };
  const g = new GeminiSandbox({ ...opts, market: { getContract: async () => contract } as unknown as GeminiPublic, baseUrl: 'https://api.sandbox.gemini.com' });
  assert.equal((await g.quote('GEMI-NO-SELLERS')).askMicros, null);
});
