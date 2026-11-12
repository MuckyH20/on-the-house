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
import { GeminiSandbox } from './venue/gemini-sandbox';
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

  // Public market data: production host (read-only, allowed) and the sandbox host (where sandbox hedges trade).
  const prodPublic = new GeminiPublic(env.GEMINI_PUBLIC_BASE_URL);
  const sandboxPublic = new GeminiPublic(env.GEMINI_SANDBOX_BASE_URL);
  const listSource = env.GEMINI_MODE === 'sandbox' ? sandboxPublic : prodPublic;
  const mock = new MockGemini(priceToMicros(String(env.MOCK_DEFAULT_ASK)), async (symbol) => {
    const m = symbol.startsWith('GEMI-') ? await listSource.getMarket(symbol) : null;
    return m?.yesAsk ? priceToMicros(m.yesAsk) : null;
  });

  let venue: Venue = mock;
  let gemini: GeminiSandbox | null = null;
  if (env.GEMINI_MODE === 'sandbox') {
    gemini = new GeminiSandbox({
      baseUrl: env.GEMINI_SANDBOX_BASE_URL,
      apiKey: env.GEMINI_API_KEY!,
      apiSecret: env.GEMINI_API_SECRET!,
      account: env.GEMINI_ACCOUNT,
      market: sandboxPublic,
    });
    const terms = await gemini.assertReady();
    venue = gemini;
    log.info({ termsVersion: terms.acceptedVersion }, 'hedges go to the Gemini SANDBOX (test funds)');
  } else {
    log.warn('hedges go to the SIMULATED Gemini order book (GEMINI_MODE=mock)');
  }
  const markets: MarketSource = new CombinedMarkets({
    list: listSource,
    mock,
    listMockMarkets: env.GEMINI_MODE === 'mock',
    resolutionSource: env.RESOLUTION_SOURCE,
    resolvers: { production: prodPublic, sandbox: sandboxPublic },
  });
  log.info({ gemini: env.GEMINI_MODE, resolution: env.RESOLUTION_SOURCE, marketList: new URL(listSource === sandboxPublic ? env.GEMINI_SANDBOX_BASE_URL : env.GEMINI_PUBLIC_BASE_URL).host }, 'venue configured');

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

  // INGEST_MODE=quicknode: the Streams webhook is the live feed; poll mode uses a websocket. The signature backfill
  // runs in both modes as a safety net (same deduped handler).
  if (env.INGEST_MODE === 'poll') ingest.startWebsocket();
  else log.info('live ingest via QuickNode Streams webhook (POST /webhooks/quicknode)');
  ingest.startBackfill(env.BACKFILL_INTERVAL_MS);
  settler.start();
  // Safety net: re-check hedges periodically (covers missed events and paused-by-hedger recovery).
  const sweep = setInterval(() => hedger.kickAll(), 20_000);
  hedger.kickAll();

  const app = await buildServer({ env, chain, repo, registry, hedger, settler, ingest, venue, markets, mock, gemini, log: log.child({ mod: 'http' }) });
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
  // A rate-limited or flaky RPC (public devnet returns 429s) can reject a promise deep inside web3.js. Every engine
  // loop retries on its own (backfill, hedger sweep, settler), so log and keep serving instead of crashing.
  process.on('unhandledRejection', (reason) => {
    log.error({ err: reason instanceof Error ? { message: reason.message, stack: reason.stack } : String(reason) }, 'unhandled rejection (continuing)');
  });
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((e) => {
  console.error(`engine failed to start: ${(e as Error).message}`);
  process.exit(1);
});
