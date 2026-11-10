import type { MarketSummary } from '@oth/shared/api';
import type { GeminiPublic } from './gemini-public';
import type { MockGemini } from './mock';
import type { MarketSource, Resolution } from './types';

/**
 * What the app sees as "markets": SIMULATED mock markets plus live Gemini markets (public data).
 * Resolution follows RESOLUTION_SOURCE: `mock` → the mock admin endpoint decides (even for real Gemini symbols,
 * and the summary then shows the SIMULATED outcome); `production` → Gemini's public `resolutionSide`.
 */
export class CombinedMarkets implements MarketSource {
  constructor(
    private readonly mock: MockGemini,
    private readonly gemini: GeminiPublic | null,
    private readonly resolutionSource: 'mock' | 'production',
  ) {}

  get simulated(): boolean {
    return this.resolutionSource === 'mock';
  }

  async listMarkets(): Promise<MarketSummary[]> {
    const sim = await this.mock.listMarkets();
    const live = this.gemini ? await this.gemini.listMarkets().catch(() => []) : [];
    return [...live, ...sim];
  }

  async getMarket(symbol: string): Promise<MarketSummary | null> {
    const mocked = await this.mock.getMarket(symbol);
    const live = this.gemini && symbol.startsWith('GEMI-') ? await this.gemini.getMarket(symbol).catch(() => null) : null;
    if (!live) return mocked;
    if (this.resolutionSource === 'mock') {
      // Real market metadata; SIMULATED resolution state.
      return { ...live, status: mocked?.outcome ? 'resolved' : live.status === 'resolved' ? 'closed' : live.status, outcome: mocked?.outcome ?? null, simulated: true };
    }
    return live;
  }

  async resolution(symbol: string): Promise<Resolution> {
    if (this.resolutionSource === 'production' && this.gemini && symbol.startsWith('GEMI-')) return this.gemini.resolution(symbol);
    return this.mock.resolution(symbol);
  }
}
