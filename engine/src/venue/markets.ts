import type { MarketSummary } from '@oth/shared/api';
import type { GeminiPublic } from './gemini-public';
import type { MockGemini } from './mock';
import type { MarketSource, Resolution } from './types';

/**
 * What the app sees as "markets", and where resolution comes from.
 *  - `list`: Gemini public data for browsing/prices. GEMINI_MODE=mock → production host; GEMINI_MODE=sandbox → the
 *    sandbox host (only ~20% of production symbols exist there, and hedges must be placed on tradable symbols).
 *  - `mock`: SIMULATED markets (listed only in mock mode) and the mock admin resolver.
 *  - RESOLUTION_SOURCE: `mock` → the mock admin endpoint decides (summary shows the SIMULATED outcome);
 *    `production` / `sandbox` → that Gemini host's public `resolutionSide`.
 */
export class CombinedMarkets implements MarketSource {
  constructor(
    private readonly o: {
      list: GeminiPublic | null;
      mock: MockGemini;
      listMockMarkets: boolean;
      resolutionSource: 'mock' | 'production' | 'sandbox';
      resolvers: { production?: GeminiPublic; sandbox?: GeminiPublic };
    },
  ) {}

  get simulated(): boolean {
    return this.o.resolutionSource === 'mock';
  }

  async listMarkets(): Promise<MarketSummary[]> {
    const live = this.o.list ? await this.o.list.listMarkets().catch(() => []) : [];
    const sim = this.o.listMockMarkets ? await this.o.mock.listMarkets() : [];
    return [...live, ...sim];
  }

  async getMarket(symbol: string): Promise<MarketSummary | null> {
    const mocked = await this.o.mock.getMarket(symbol);
    const live = this.o.list && symbol.startsWith('GEMI-') ? await this.o.list.getMarket(symbol).catch(() => null) : null;
    if (!live) return mocked;
    if (this.o.resolutionSource === 'mock') {
      // Real market metadata; SIMULATED resolution state.
      return { ...live, status: mocked?.outcome ? 'resolved' : live.status === 'resolved' ? 'closed' : live.status, outcome: mocked?.outcome ?? null, simulated: true };
    }
    return live;
  }

  async resolution(symbol: string): Promise<Resolution> {
    const src = this.o.resolutionSource;
    const resolver = src === 'production' ? this.o.resolvers.production : src === 'sandbox' ? this.o.resolvers.sandbox : undefined;
    if (resolver && symbol.startsWith('GEMI-')) return resolver.resolution(symbol);
    return this.o.mock.resolution(symbol);
  }
}
