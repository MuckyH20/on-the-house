import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import { PublicKey } from '@solana/web3.js';
import { coverageBps, microsToPrice, quoteSale, unhedgedLiability, type EngineEnv } from '@oth/shared';
import type { CampaignState, CampaignSummary, EngineInfo, MarketSummary, Quote, SimulatedFlags, VenueProof, WalletClaim } from '@oth/shared/api';
import { claimAta, type CampaignView } from '@oth/shared/program';
import { z } from 'zod';
import type { Repo } from './db';
import { decodeBody, extractTransactions, NonceCache, verifyQuickNode } from './quicknode';
import { checkShopSave } from './shops';
import { attachOrder, setOrderStatus } from './orders';
import type { Hedger } from './hedger';
import type { Ingest } from './ingest';
import { isPubkey, type Registry } from './registry';
import type { Settler } from './settler';
import type { Chain } from './solana';
import type { GeminiSandbox } from './venue/gemini-sandbox';
import type { MockGemini } from './venue/mock';
import type { MarketSource, Venue } from './venue/types';

export interface Deps {
  env: EngineEnv;
  chain: Chain;
  repo: Repo;
  registry: Registry;
  hedger: Hedger;
  settler: Settler;
  ingest: Ingest;
  venue: Venue;
  markets: MarketSource;
  mock: MockGemini | null;
  gemini: GeminiSandbox | null;
  log: import('pino').Logger;
}

export function simulatedFlags(env: EngineEnv): SimulatedFlags {
  return { gemini: env.GEMINI_MODE === 'mock', resolution: env.RESOLUTION_SOURCE === 'mock' };
}

export async function buildServer(d: Deps): Promise<FastifyInstance> {
  const { env, chain, repo, registry, hedger, settler, markets, venue } = d;
  const app = Fastify({ logger: false });
  const origins = env.CORS_ORIGINS.trim() === '*' ? true : env.CORS_ORIGINS.split(',').map((s) => s.trim());
  await app.register(cors, { origin: origins, methods: ['GET', 'HEAD', 'POST', 'PUT'] });
  const simulated = simulatedFlags(env);
  /** Practice games (SIM-…) are simulated even when the engine trades on the real sandbox. */
  const flagsFor = (symbol: string): SimulatedFlags =>
    symbol.startsWith('SIM-') ? { gemini: true, resolution: true } : simulated;

  const notFound = (reply: FastifyReply, what: string) => reply.code(404).send({ error: `${what} not found` });

  const cutoffMs = env.SALES_CUTOFF_MINUTES * 60_000;
  /** True when the venue will stop taking orders before we could hedge a sale (Gemini: ~10 min before close). */
  const closesSoon = (m: MarketSummary | null) => !!m?.closesAt && Date.parse(m.closesAt) - Date.now() < cutoffMs;

  async function marketFor(symbol: string): Promise<MarketSummary | null> {
    return markets.getMarket(symbol).catch(() => null);
  }

  // Gemini's own record of our hedges (sandbox mode). Cached briefly: dashboards rebuild state often.
  let venueCache: { at: number; positions: Map<string, string>; settled: Map<string, { payout: number; side: 'yes' | 'no'; at: string }>; error: string | null } | null = null;
  async function venueProof(symbol: string): Promise<VenueProof | undefined> {
    if (!d.gemini) return undefined;
    if (!venueCache || Date.now() - venueCache.at > 5_000) {
      const next = { at: Date.now(), positions: new Map<string, string>(), settled: new Map<string, { payout: number; side: 'yes' | 'no'; at: string }>(), error: null as string | null };
      try {
        for (const p of await d.gemini.positions()) if (p.outcome === 'yes') next.positions.set(p.symbol, p.totalQuantity);
        for (const p of (await d.gemini.settledPositions()).positions) {
          const prev = next.settled.get(p.instrumentSymbol);
          next.settled.set(p.instrumentSymbol, { payout: (prev?.payout ?? 0) + Number(p.payout), side: p.resolutionSide, at: p.settledAt });
        }
      } catch (e) {
        next.error = (e as Error).message;
        if (venueCache) Object.assign(next, { positions: venueCache.positions, settled: venueCache.settled });
      }
      venueCache = next;
    }
    const st = venueCache.settled.get(symbol);
    return {
      source: 'gemini-sandbox',
      positionContracts: venueCache.positions.get(symbol) ?? null,
      settledPayout: st ? st.payout.toFixed(2) : null,
      resolutionSide: st?.side ?? null,
      settledAt: st?.at ?? null,
      checkedAt: venueCache.at,
      error: venueCache.error,
    };
  }

  async function campaignState(c: CampaignView): Promise<CampaignState> {
    const liability = BigInt(c.liability);
    const hedged = BigInt(c.hedgedContracts);
    return {
      campaign: c,
      market: await marketFor(c.marketSymbol),
      promised: c.liability,
      covered: (hedged * 1_000_000n).toString(),
      unhedged: unhedgedLiability(liability, hedged).toString(),
      coverageBps: coverageBps(liability, hedged),
      fills: repo.fillsForCampaign(c.address),
      events: repo.eventsForCampaign(c.address, 100),
      hedger: hedger.statusFor(c),
      settlement: settler.statusFor(c),
      venue: c.marketSymbol.startsWith('SIM-') ? undefined : await venueProof(c.marketSymbol),
      simulated: flagsFor(c.marketSymbol),
      updatedAt: Date.now(),
    };
  }

  app.get('/health', async (): Promise<EngineInfo & { salesCutoffMinutes: number }> => ({
    salesCutoffMinutes: env.SALES_CUTOFF_MINUTES,
    ok: true,
    cluster: chain.cluster,
    programId: chain.programId.toBase58(),
    usdcMint: chain.usdcMint.toBase58(),
    treasury: chain.treasury.toBase58(),
    operator: chain.operator.publicKey.toBase58(),
    platformMarginBps: env.PLATFORM_MARGIN_BPS,
    geminiMode: env.GEMINI_MODE,
    ingestMode: env.INGEST_MODE,
    resolutionSource: env.RESOLUTION_SOURCE,
    simulated,
  }));

  app.get('/markets', async (req: FastifyRequest<{ Querystring: { q?: string; category?: string; limit?: string } }>) => {
    const q = req.query.q?.trim().toLowerCase();
    const cat = req.query.category?.trim().toLowerCase();
    const limit = Math.min(Math.max(Number(req.query.limit) || 60, 1), 500);
    const all = (await markets.listMarkets()).filter(
      (m) =>
        m.status === 'open' &&
        (!m.closesAt || Date.parse(m.closesAt) - Date.now() >= cutoffMs) &&
        (!q || `${m.title} ${m.symbol}`.toLowerCase().includes(q)) &&
        (!cat || m.category.toLowerCase() === cat),
    );
    const categories = [...new Set(all.map((m) => m.category))].sort();
    return { markets: all.slice(0, limit), total: all.length, categories, simulated: markets.simulated };
  });

  app.get('/markets/:symbol', async (req: FastifyRequest<{ Params: { symbol: string } }>, reply) => {
    const m = await marketFor(req.params.symbol);
    return m ?? notFound(reply, 'market');
  });

  // ---------------- orders (items + pickup status) ----------------
  app.post('/orders', async (req, reply) => {
    const r = await attachOrder(chain, repo, req.body);
    if (!r.ok) return reply.code(r.status).send({ error: r.error });
    registry.changed(r.order.campaign);
    return r.order;
  });
  app.get('/orders/:signature', async (req: FastifyRequest<{ Params: { signature: string } }>, reply) => repo.getOrder(req.params.signature) ?? notFound(reply, 'order'));
  app.put('/orders/:signature/status', async (req: FastifyRequest<{ Params: { signature: string } }>, reply) => {
    const r = await setOrderStatus(chain, repo, req.params.signature, req.body);
    if (!r.ok) return reply.code(r.status).send({ error: r.error });
    registry.changed(r.order.campaign);
    return r.order;
  });
  app.get('/campaigns/:id/orders', async (req: FastifyRequest<{ Params: { id: string } }>) => ({ orders: repo.ordersForCampaign(req.params.id) }));

  // ---------------- shops ----------------
  app.get('/shops/:merchant', async (req: FastifyRequest<{ Params: { merchant: string } }>, reply) => {
    if (!isPubkey(req.params.merchant)) return reply.code(400).send({ error: 'invalid wallet address' });
    return repo.getShop(req.params.merchant) ?? notFound(reply, 'shop');
  });

  app.put('/shops/:merchant', async (req: FastifyRequest<{ Params: { merchant: string } }>, reply) => {
    if (!isPubkey(req.params.merchant)) return reply.code(400).send({ error: 'invalid wallet address' });
    const r = checkShopSave(req.params.merchant, req.body);
    if (!r.ok) return reply.code(400).send({ error: r.error });
    repo.saveShop(r.profile);
    return r.profile;
  });

  app.get('/campaigns', async (req: FastifyRequest<{ Querystring: { merchant?: string } }>): Promise<{ campaigns: CampaignSummary[] }> => {
    const out: CampaignSummary[] = [];
    for (const c of registry.all().filter((x) => !req.query.merchant || x.merchant === req.query.merchant)) {
      out.push({
        campaign: c,
        market: await marketFor(c.marketSymbol),
        coverageBps: coverageBps(BigInt(c.liability), BigInt(c.hedgedContracts)),
        hedger: hedger.statusFor(c),
        settlement: settler.statusFor(c),
      });
    }
    return { campaigns: out };
  });

  app.get('/campaigns/:id/state', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const c = await registry.getOrFetch(req.params.id);
    return c ? campaignState(c) : notFound(reply, 'campaign');
  });

  /** Server-sent events: the full CampaignState on connect and after every change (debounced). */
  app.get('/campaigns/:id/stream', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const id = req.params.id;
    const first = await registry.getOrFetch(id);
    if (!first) return notFound(reply, 'campaign');
    reply.hijack();
    const raw = reply.raw;
    const origin = req.headers.origin;
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      ...(origin && (origins === true || (origins as string[]).includes(origin)) ? { 'Access-Control-Allow-Origin': origin } : {}),
    });
    const send = async () => {
      const c = registry.get(id);
      if (c) raw.write(`event: state\ndata: ${JSON.stringify(await campaignState(c))}\n\n`);
    };
    let pending: NodeJS.Timeout | null = null;
    const onChange = (addr: string) => {
      if (addr !== id || pending) return;
      pending = setTimeout(() => {
        pending = null;
        void send();
      }, 200);
    };
    registry.on('change', onChange);
    const heartbeat = setInterval(() => raw.write(': ping\n\n'), 15_000);
    req.raw.on('close', () => {
      registry.off('change', onChange);
      clearInterval(heartbeat);
      if (pending) clearTimeout(pending);
    });
    await send();
  });

  app.get('/quote/:campaign', async (req: FastifyRequest<{ Params: { campaign: string }; Querystring: { amount?: string } }>, reply) => {
    const c = await registry.getOrFetch(req.params.campaign);
    if (!c) return notFound(reply, 'campaign');
    const q = await venue.quote(c.marketSymbol);
    const maxPrice = hedger.maxPriceMicros(c, q.tickMicros);
    const nowSec = Math.floor(Date.now() / 1000);
    let reason: string | null = null;
    if (c.status === 'settled' || c.status === 'cancelled') reason = 'This promo has ended.';
    else if (nowSec > c.salesDeadline) reason = 'This promo has ended.';
    else if (hedger.pausedByHedger(c.address)) reason = 'This promo is paused for a moment.';
    else if (c.status === 'paused') reason = 'This promo is paused.';
    else if (closesSoon(await marketFor(c.marketSymbol))) reason = 'Sales for this promo have closed.';
    else if (q.askMicros === null) reason = 'Refund protection is refreshing — try again in a minute.';
    else if (q.askMicros > maxPrice) reason = 'This promo is paused for a moment.';
    const quote: Quote = {
      campaign: c.address,
      marketSymbol: c.marketSymbol,
      yesAsk: q.askMicros === null ? null : microsToPrice(q.askMicros),
      askMicros: q.askMicros?.toString() ?? null,
      premiumBps: null,
      refundBps: c.refundBps,
      maxPremiumBps: c.maxPremiumBps,
      maxPriceMicros: maxPrice.toString(),
      paused: c.status !== 'open' || hedger.pausedByHedger(c.address),
      available: reason === null,
      reason,
      simulated: flagsFor(c.marketSymbol),
      quotedAt: Date.now(),
    };
    if (q.askMicros !== null) {
      const amount = req.query.amount ? BigInt(z.string().regex(/^\d+$/).parse(req.query.amount)) : 1_000_000n;
      const s = quoteSale({ amount, refundBps: c.refundBps, maxPremiumBps: c.maxPremiumBps, askMicros: q.askMicros, platformMarginBps: env.PLATFORM_MARGIN_BPS });
      quote.premiumBps = s.premiumBps;
      if (req.query.amount) {
        quote.amount = amount.toString();
        quote.premium = s.premium.toString();
        quote.refund = s.refund.toString();
      }
      if (!s.withinCap && quote.available) {
        quote.available = false;
        quote.reason = 'This promo is paused for a moment.';
      }
    }
    return quote;
  });

  /** Ask the hedger to look at a campaign now (the web app calls this right after a purchase lands). */
  app.post('/campaigns/:id/kick', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const c = await registry.getOrFetch(req.params.id);
    if (!c) return notFound(reply, 'campaign');
    hedger.kick(c.address);
    return { ok: true };
  });

  app.get('/wallets/:wallet/claims', async (req: FastifyRequest<{ Params: { wallet: string } }>, reply) => {
    const wallet = req.params.wallet;
    if (!isPubkey(wallet)) return reply.code(400).send({ error: 'invalid wallet address' });
    const byCampaign = new Map<string, WalletClaim>();
    for (const e of repo.eventsForWallet(wallet)) {
      const addr = e.campaign!;
      let wc = byCampaign.get(addr);
      if (!wc) {
        const c = await registry.getOrFetch(addr);
        if (!c) continue;
        wc = {
          campaign: addr,
          marketSymbol: c.marketSymbol,
          market: await marketFor(c.marketSymbol),
          refundBps: c.refundBps,
          purchases: [],
          claimBalance: '0',
          paidOut: '0',
          status: c.status,
          outcome: c.outcome,
        };
        byCampaign.set(addr, wc);
      }
      if (e.name === 'purchaseEvent') {
        wc.purchases.push({ signature: e.signature, amount: String(e.data.amount), premium: String(e.data.premium), refund: String(e.data.refund), at: e.blockTime });
      } else if (e.name === 'payoutEvent') {
        wc.paidOut = (BigInt(wc.paidOut) + BigInt(String(e.data.amount))).toString();
      }
    }
    for (const wc of byCampaign.values()) {
      const c = registry.get(wc.campaign)!;
      const acct = claimAta(new PublicKey(wallet), new PublicKey(c.claimMint));
      const bal = await chain.connection.getTokenAccountBalance(acct, 'confirmed').catch(() => null);
      wc.claimBalance = bal?.value.amount ?? '0';
    }
    return { wallet, claims: [...byCampaign.values()].reverse() };
  });

  // ---------------- SIMULATED venue admin (mock mode only) ----------------
  // Only when something is actually simulated: never expose a resolve button for a real (sandbox) setup.
  if (d.mock) {
    const mock = d.mock;
    const anySimulated = simulated.gemini || simulated.resolution;
    const guard = (req: FastifyRequest<{ Params: { symbol: string } }>, reply: FastifyReply): boolean => {
      // With real trading on, only practice games can be driven by hand — never a real market.
      if (!anySimulated && !req.params.symbol.startsWith('SIM-PRACTICE-')) {
        void reply.code(404).send({ error: 'not found' });
        return false;
      }
      if (!env.MOCK_ADMIN_TOKEN) return true;
      if (req.headers.authorization === `Bearer ${env.MOCK_ADMIN_TOKEN}`) return true;
      void reply.code(401).send({ error: 'mock admin token required' });
      return false;
    };
    app.post('/mock/markets/:symbol/price', async (req: FastifyRequest<{ Params: { symbol: string }; Body: { price?: unknown } }>, reply) => {
      if (!guard(req, reply)) return;
      const price = z.union([z.number(), z.string()]).parse(req.body?.price);
      const market = mock.setAsk(req.params.symbol, price);
      return { market, simulated: true };
    });
    app.post('/mock/markets/:symbol/resolve', async (req: FastifyRequest<{ Params: { symbol: string }; Body: { outcome?: unknown } }>, reply) => {
      if (!guard(req, reply)) return;
      const outcome = z.enum(['yes', 'no']).parse(req.body?.outcome);
      const market = mock.resolve(req.params.symbol, outcome);
      return { market, simulated: true };
    });
  }

  // ---------------- QuickNode Streams webhook ----------------
  // Verified per docs/research/quicknode/validating-webhooks.md, then fed into the same idempotent ingest pipeline.
  const nonces = new NonceCache();
  await app.register(async (scope) => {
    // Keep the exact bytes: the HMAC covers the (decoded) body as sent.
    // Accept any content type (a 415 here would be invisible to us and make Streams pause the stream).
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser('*', { parseAs: 'buffer', bodyLimit: 10 * 1024 * 1024 }, (_req, body, done) => done(null, body));
    scope.addHook('onResponse', async (req, reply) => {
      if (!req.url.startsWith('/webhooks/quicknode')) return;
      d.log.info(
        {
          status: reply.statusCode,
          contentType: req.headers['content-type'],
          contentEncoding: req.headers['content-encoding'],
          bytes: req.headers['content-length'],
          hasSig: !!req.headers['x-qn-signature'],
          ua: req.headers['user-agent'],
          ms: Math.round(reply.elapsedTime),
        },
        'quicknode request',
      );
    });
    scope.post('/webhooks/quicknode', async (req, reply) => {
      const token = env.QUICKNODE_STREAM_SECURITY_TOKEN;
      if (!token) return reply.code(503).send({ error: 'QUICKNODE_STREAM_SECURITY_TOKEN is not configured' });
      let payload: string;
      try {
        payload = decodeBody(req.body as Buffer, req.headers['content-encoding'] as string | undefined);
      } catch {
        return reply.code(400).send({ error: 'could not decode body' });
      }
      const h = (n: string) => (req.headers[n] as string | undefined) ?? undefined;
      const v = verifyQuickNode({ token, nonce: h('x-qn-nonce'), timestamp: h('x-qn-timestamp'), signature: h('x-qn-signature'), payload, nonces });
      if (!v.ok) {
        d.log.warn({ reason: v.reason }, 'quicknode webhook rejected');
        return reply.code(401).send({ error: v.reason });
      }
      let body: unknown;
      try {
        body = payload ? JSON.parse(payload) : null;
      } catch {
        return reply.code(400).send({ error: 'invalid JSON' });
      }
      const txs = extractTransactions(body);
      let fresh = 0;
      for (const tx of txs) fresh += await d.ingest.ingestLogs({ ...tx, source: 'quicknode' });
      d.log.info({ transactions: txs.length, fresh }, 'quicknode delivery');
      // 2xx tells Streams the batch is delivered (it retries otherwise).
      return { ok: true, transactions: txs.length, fresh };
    });
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof z.ZodError) return reply.code(400).send({ error: err.issues.map((i) => i.message).join('; ') });
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    return reply.code(status).send({ error: (err as Error).message });
  });

  return app;
}
