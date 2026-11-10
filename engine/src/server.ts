import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import { PublicKey } from '@solana/web3.js';
import { coverageBps, microsToPrice, quoteSale, unhedgedLiability, type EngineEnv } from '@oth/shared';
import type { CampaignState, CampaignSummary, EngineInfo, MarketSummary, Quote, SimulatedFlags, WalletClaim } from '@oth/shared/api';
import { claimAta, type CampaignView } from '@oth/shared/program';
import { z } from 'zod';
import type { Repo } from './db';
import type { Hedger } from './hedger';
import type { Ingest } from './ingest';
import { isPubkey, type Registry } from './registry';
import type { Settler } from './settler';
import type { Chain } from './solana';
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
}

export function simulatedFlags(env: EngineEnv): SimulatedFlags {
  return { gemini: env.GEMINI_MODE === 'mock', resolution: env.RESOLUTION_SOURCE === 'mock' };
}

export async function buildServer(d: Deps): Promise<FastifyInstance> {
  const { env, chain, repo, registry, hedger, settler, markets, venue } = d;
  const app = Fastify({ logger: false });
  const origins = env.CORS_ORIGINS.trim() === '*' ? true : env.CORS_ORIGINS.split(',').map((s) => s.trim());
  await app.register(cors, { origin: origins });
  const simulated = simulatedFlags(env);

  const notFound = (reply: FastifyReply, what: string) => reply.code(404).send({ error: `${what} not found` });

  async function marketFor(symbol: string): Promise<MarketSummary | null> {
    return markets.getMarket(symbol).catch(() => null);
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
      simulated,
      updatedAt: Date.now(),
    };
  }

  app.get('/health', async (): Promise<EngineInfo> => ({
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

  app.get('/markets', async () => ({ markets: await markets.listMarkets(), simulated: markets.simulated }));

  app.get('/campaigns', async (): Promise<{ campaigns: CampaignSummary[] }> => {
    const out: CampaignSummary[] = [];
    for (const c of registry.all()) {
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
    else if (q.askMicros === null) reason = 'This promo is not available right now.';
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
      simulated,
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
  if (d.mock) {
    const mock = d.mock;
    const guard = (req: FastifyRequest, reply: FastifyReply): boolean => {
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

  // QuickNode Streams webhook — Phase B (milestone 7). Refuse until it's implemented and configured.
  app.post('/webhooks/quicknode', async (_req, reply) =>
    reply.code(503).send({ error: env.INGEST_MODE === 'quicknode' ? 'QuickNode ingest not implemented yet' : 'INGEST_MODE is not quicknode' }),
  );

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof z.ZodError) return reply.code(400).send({ error: err.issues.map((i) => i.message).join('; ') });
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    return reply.code(status).send({ error: (err as Error).message });
  });

  return app;
}
