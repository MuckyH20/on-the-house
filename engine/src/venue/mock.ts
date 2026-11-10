import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { microsToPrice, priceToMicros } from '@oth/shared';
import type { MarketSummary } from '@oth/shared/api';
import type { MarketQuote, MarketSource, OrderResult, Resolution, Venue } from './types';

const TICK = 10_000n; // $0.01
const SPREAD = 20_000n; // bid = ask − $0.02

interface MockMarket {
  symbol: string;
  title: string;
  condition: string;
  category: string;
  askMicros: bigint;
  closesAt: string | null;
  outcome: 'yes' | 'no' | null;
  /** Created on demand for a symbol we only know from a campaign (e.g. a real Gemini symbol hedged in mock mode). */
  adHoc: boolean;
}

/**
 * SIMULATED Gemini: an in-memory order book with a configurable YES ask and unlimited depth. Limit buys at or
 * above the ask fill instantly at the ask; below it, nothing trades. Admin endpoints move the price and resolve.
 */
export class MockGemini extends EventEmitter implements Venue, MarketSource {
  readonly simulated = true;
  private readonly markets = new Map<string, MockMarket>();
  private readonly orders = new Map<string, OrderResult>();

  constructor(private readonly defaultAskMicros: bigint) {
    super();
    for (const m of seedMarkets(defaultAskMicros)) this.markets.set(m.symbol, m);
  }

  private market(symbol: string): MockMarket {
    let m = this.markets.get(symbol);
    if (!m) {
      m = {
        symbol,
        title: symbol,
        condition: `the market ${symbol} resolves YES`,
        category: 'simulated',
        askMicros: this.defaultAskMicros,
        closesAt: null,
        outcome: null,
        adHoc: true,
      };
      this.markets.set(symbol, m);
    }
    return m;
  }

  async quote(symbol: string): Promise<MarketQuote> {
    const m = this.market(symbol);
    if (m.outcome) return { symbol, askMicros: null, bidMicros: null, tickMicros: TICK };
    return { symbol, askMicros: m.askMicros, bidMicros: m.askMicros > SPREAD ? m.askMicros - SPREAD : null, tickMicros: TICK };
  }

  async buyYes(p: { symbol: string; contracts: number; limitPriceMicros: bigint; clientOrderId: string }): Promise<OrderResult> {
    const existing = this.orders.get(p.clientOrderId);
    if (existing) return existing;
    const m = this.market(p.symbol);
    const orderId = `SIM-${randomUUID().slice(0, 8)}`;
    let res: OrderResult;
    if (m.outcome) {
      res = { orderId, clientOrderId: p.clientOrderId, filledContracts: 0, avgPriceMicros: 0n, state: 'rejected', reason: 'market is resolved' };
    } else if (p.limitPriceMicros >= m.askMicros) {
      res = { orderId, clientOrderId: p.clientOrderId, filledContracts: p.contracts, avgPriceMicros: m.askMicros, state: 'filled' };
    } else {
      res = {
        orderId,
        clientOrderId: p.clientOrderId,
        filledContracts: 0,
        avgPriceMicros: 0n,
        state: 'open',
        reason: `ask $${microsToPrice(m.askMicros)} is above the limit $${microsToPrice(p.limitPriceMicros)}`,
      };
    }
    this.orders.set(p.clientOrderId, res);
    return res;
  }

  async cancel(orderId: string): Promise<void> {
    for (const [k, o] of this.orders) if (o.orderId === orderId && o.state === 'open') this.orders.set(k, { ...o, state: 'rejected', reason: 'cancelled' });
  }

  // ---- MarketSource ----

  async listMarkets(): Promise<MarketSummary[]> {
    return [...this.markets.values()].filter((m) => !m.adHoc).map(toSummary);
  }

  async getMarket(symbol: string): Promise<MarketSummary | null> {
    const m = this.markets.get(symbol);
    return m ? toSummary(m) : null;
  }

  async resolution(symbol: string): Promise<Resolution> {
    const m = this.markets.get(symbol);
    return m?.outcome ? { resolved: true, outcome: m.outcome } : { resolved: false };
  }

  // ---- admin (SIMULATED) ----

  setAsk(symbol: string, price: string | number): MarketSummary {
    const micros = priceToMicros(price);
    if (micros <= 0n || micros >= 1_000_000n) throw new Error('price must be between 0 and 1');
    const m = this.market(symbol);
    m.askMicros = (micros / TICK) * TICK;
    this.emit('price', symbol);
    return toSummary(m);
  }

  resolve(symbol: string, outcome: 'yes' | 'no'): MarketSummary {
    const m = this.market(symbol);
    m.outcome = outcome;
    this.emit('resolved', symbol, outcome);
    return toSummary(m);
  }
}

function toSummary(m: MockMarket): MarketSummary {
  const resolved = m.outcome !== null;
  return {
    symbol: m.symbol,
    eventId: null,
    title: m.title,
    condition: m.condition,
    category: m.category,
    yesAsk: resolved ? null : microsToPrice(m.askMicros),
    yesBid: resolved || m.askMicros <= SPREAD ? null : microsToPrice(m.askMicros - SPREAD),
    closesAt: m.closesAt,
    status: resolved ? 'resolved' : 'open',
    outcome: m.outcome,
    simulated: true,
    source: 'mock',
  };
}

/** A few SIMULATED markets so the demo works offline. Resolution is manual via the admin endpoint. */
function seedMarkets(ask: bigint): MockMarket[] {
  const today3pm = new Date();
  today3pm.setHours(15, 0, 0, 0);
  if (today3pm.getTime() < Date.now()) today3pm.setDate(today3pm.getDate() + 1);
  const base = { category: 'simulated', outcome: null, adHoc: false } as const;
  return [
    {
      ...base,
      symbol: 'SIM-BTC-ABOVE-100K',
      title: 'Will BTC be above $100,000 at 3:00 PM? (SIMULATED)',
      condition: 'Bitcoin is above $100,000 at 3:00 PM',
      askMicros: ask,
      closesAt: today3pm.toISOString(),
    },
    {
      ...base,
      symbol: 'SIM-BEARS-WIN',
      title: 'Will the Bears win their next game? (SIMULATED)',
      condition: 'the Bears win their next game',
      askMicros: 450_000n,
      closesAt: null,
    },
    {
      ...base,
      symbol: 'SIM-SNOW-CHAMPAIGN',
      title: 'Will it snow in Champaign this week? (SIMULATED)',
      condition: 'it snows in Champaign this week',
      askMicros: 150_000n,
      closesAt: null,
    },
  ];
}
