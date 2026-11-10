import pino from 'pino';
import { resolveFromRoot } from '@oth/shared/node';
import { priceToMicros } from '@oth/shared';
import { Repo } from './db';
import { loadEngineEnv } from './env';
import { Hedger } from './hedger';
import { Ingest } from './ingest';
import { Registry } from './registry';
import { buildServer } from './server';
import { Settler } from './settler';
import { connectChain } from './solana';
import { GeminiPublic } from './venue/gemini-public';
import { CombinedMarkets } from './venue/markets';
import { MockGemini } from './venue/mock';
import type { MarketSource, Venue } from './venue/types';

async function main() {
  const env = loadEngineEnv();
  const log = pino({
    level: env.LOG_LEVEL,
    ...(process.stdout.isTTY ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } } : {}),
  });

  const chain = await connectChain(env);
  log.info({ cluster: chain.cluster, programId: chain.programId.toBase58(), operator: chain.operator.publicKey.toBase58() }, 'connected');

  if (env.GEMINI_MODE !== 'mock' || env.RESOLUTION_SOURCE === 'sandbox') {
    // Phase B (milestone 6) adds the signed Gemini sandbox trading client.
    throw new Error('GEMINI_MODE=sandbox / RESOLUTION_SOURCE=sandbox are not implemented yet (Phase B). Use GEMINI_MODE=mock.');
  }
  // Public market data is read from production Gemini (read-only, allowed); trading stays on the mock book.
  const gemini = new GeminiPublic(env.GEMINI_PUBLIC_BASE_URL);
  const mock = new MockGemini(priceToMicros(String(env.MOCK_DEFAULT_ASK)), async (symbol) => {
    const m = symbol.startsWith('GEMI-') ? await gemini.getMarket(symbol) : null;
    return m?.yesAsk ? priceToMicros(m.yesAsk) : null;
  });
  const venue: Venue = mock;
  const markets: MarketSource = new CombinedMarkets(mock, gemini, env.RESOLUTION_SOURCE);
  log.warn({ resolution: env.RESOLUTION_SOURCE }, 'hedges go to the SIMULATED Gemini order book (GEMINI_MODE=mock)');

  const repo = new Repo(resolveFromRoot(env.DATABASE_PATH));
  const registry = new Registry(chain);
  log.info({ campaigns: await registry.loadAll() }, 'campaigns loaded');

  const hedger = new Hedger(env, chain, repo, registry, venue, log.child({ mod: 'hedger' }));
  const settler = new Settler(env, chain, repo, registry, markets, log.child({ mod: 'settler' }));

  const ingest = new Ingest(chain, repo, log.child({ mod: 'ingest' }), async (e) => {
    if (!e.campaign) return;
    if (e.name === 'campaignCreated') {
      await registry.refresh(e.campaign);
      return;
    }
    if (e.name === 'purchaseEvent') hedger.kick(e.campaign);
    else await registry.refresh(e.campaign);
  });

  mock.on('price', () => hedger.kickAll());
  mock.on('resolved', () => void settler.tick());

  if (env.INGEST_MODE === 'poll') ingest.startWebsocket();
  ingest.startBackfill(env.BACKFILL_INTERVAL_MS);
  settler.start();
  // Safety net: re-check hedges periodically (covers missed events and paused-by-hedger recovery).
  const sweep = setInterval(() => hedger.kickAll(), 20_000);
  hedger.kickAll();

  const app = await buildServer({ env, chain, repo, registry, hedger, settler, ingest, venue, markets, mock });
  await app.listen({ host: env.ENGINE_HOST, port: env.ENGINE_PORT });
  log.info(`engine listening on http://${env.ENGINE_HOST}:${env.ENGINE_PORT}`);

  const shutdown = async (sig: string) => {
    log.info({ sig }, 'shutting down');
    clearInterval(sweep);
    settler.stop();
    await ingest.stop();
    await app.close();
    await hedger.idle().catch(() => {});
    repo.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((e) => {
  console.error(`engine failed to start: ${(e as Error).message}`);
  process.exit(1);
});
