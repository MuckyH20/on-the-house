import type { MockGemini } from './mock';
import type { MarketQuote, OrderResult, Venue } from './types';

/**
 * Real venue for real markets, SIMULATED book for practice games: symbols starting with "SIM-" (and their "SIM-"
 * order ids) go to the mock; everything else goes to the Gemini sandbox.
 */
export class VenueRouter implements Venue {
  readonly simulated = false;

  constructor(
    private readonly real: Venue,
    private readonly mock: MockGemini,
  ) {}

  simulatedFor(symbol: string): boolean {
    return symbol.startsWith('SIM-');
  }

  private pick(symbol: string): Venue {
    return this.simulatedFor(symbol) ? this.mock : this.real;
  }

  quote(symbol: string): Promise<MarketQuote> {
    return this.pick(symbol).quote(symbol);
  }

  buyYes(p: { symbol: string; contracts: number; limitPriceMicros: bigint; clientOrderId: string }): Promise<OrderResult> {
    return this.pick(p.symbol).buyYes(p);
  }

  cancel(orderId: string): Promise<void> {
    return orderId.startsWith('SIM-') ? this.mock.cancel(orderId) : this.real.cancel(orderId);
  }
}
