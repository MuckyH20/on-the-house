import type { MarketSummary } from '@oth/shared/api';

/** Result of one limit buy of YES contracts. Prices are integer micro-dollars per $1 contract. */
export interface OrderResult {
  orderId: string;
  clientOrderId: string;
  /** Contracts filled (0 when the limit is below the ask and nothing traded). */
  filledContracts: number;
  avgPriceMicros: bigint;
  /** `filled` = fully filled; `open` = resting / partially filled; `rejected` = venue refused. */
  state: 'filled' | 'open' | 'rejected';
  reason?: string;
}

export interface MarketQuote {
  symbol: string;
  askMicros: bigint | null;
  bidMicros: bigint | null;
  /** Venue price increment in micros (0.01 → 10_000). */
  tickMicros: bigint;
}

export type Resolution = { resolved: false } | { resolved: true; outcome: 'yes' | 'no' };

/**
 * Where hedges are bought. `mock` = in-memory SIMULATED book; `sandbox` = Gemini sandbox (Phase B).
 * The engine only ever talks to this interface.
 */
export interface Venue {
  readonly simulated: boolean;
  /** Per-symbol answer when one venue routes some symbols to a simulated book (practice games). */
  simulatedFor?(symbol: string): boolean;
  quote(symbol: string): Promise<MarketQuote>;
  /** Buy `contracts` YES contracts at no more than `limitPriceMicros` each. Must be idempotent on clientOrderId. */
  buyYes(p: { symbol: string; contracts: number; limitPriceMicros: bigint; clientOrderId: string }): Promise<OrderResult>;
  cancel(orderId: string): Promise<void>;
}

/** Where market lists and resolutions come from (may differ from the trading venue). */
export interface MarketSource {
  readonly simulated: boolean;
  listMarkets(): Promise<MarketSummary[]>;
  getMarket(symbol: string): Promise<MarketSummary | null>;
  resolution(symbol: string): Promise<Resolution>;
}
