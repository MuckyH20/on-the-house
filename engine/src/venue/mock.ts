import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { microsToPrice, priceToMicros } from '@oth/shared';
import type { MarketSummary } from '@oth/shared/api';
import type { MarketQuote, MarketSource, OrderResult, Resolution, Venue } from './types';

const TICK = 10_000n; // $0.01
export const PRACTICE_PREFIX = 'SIM-PRACTICE-';
export const isPractice = (symbol: string) => symbol.startsWith(PRACTICE_PREFIX);
const PRACTICE_TEAMS: [string, string, bigint][] = [
  ['BTC', 'Bitcoin', 350_000n],
  ['ETH', 'Ethereum', 450_000n],
];
const SPREAD = 20_000n; // bid = ask − $0.02

/**
 * Rebuild a practice game from its symbol (SIM-PRACTICE-<TEAM>-<YYYYMMDDHHMM>[-n]) so promos on it keep their
 * title and final time after an engine restart. Returns null for anything else.
 */
export function practiceFromSymbol(symbol: string): MockMarket | null {
  const m = /^SIM-PRACTICE-([A-Z]+)-(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(?:-\d+)?$/.exec(symbol);
  const team = m && PRACTICE_TEAMS.find(([t]) => t === m[1]);
  if (!m || !team) return null;
  const closesAt = new Date(Date.UTC(+m[2]!, +m[3]! - 1, +m[4]!, +m[5]!, +m[6]!)).toISOString();
  return {
    symbol,
    title: `${team[0]} price today — Up`,
    condition: `${team[1]} finishes up (practice game)`,
    category: 'practice',
    askMicros: team[2],
    closesAt,
    outcome: null,
    adHoc: true,
  };
}

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

  /**
   * @param priceHint optional live price for symbols the mock doesn't know yet (e.g. the real Gemini ask), so a
   *   SIMULATED hedge on a real market starts at a realistic price.
   */
  constructor(
    private readonly defaultAskMicros: bigint,
    private readonly priceHint?: (symbol: string) => Promise<bigint | null>,
  ) {
    super();
    for (const m of seedMarkets(defaultAskMicros)) this.markets.set(m.symbol, m);
  }

  private market(symbol: string): MockMarket {
    let m = this.markets.get(symbol);
    if (!m) m = practiceFromSymbol(symbol) ?? undefined;
    if (m) this.markets.set(symbol, m);
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

  /** Create an unknown symbol's book, seeded from the price hint when available. */
  private async ensure(symbol: string): Promise<MockMarket> {
    if (!this.markets.has(symbol) && this.priceHint) {
      const hint = await this.priceHint(symbol).catch(() => null);
      const m = this.market(symbol);
      if (hint && hint > 0n && hint < 1_000_000n) m.askMicros = (hint / TICK) * TICK;
      return m;
    }
    return this.market(symbol);
  }

  async quote(symbol: string): Promise<MarketQuote> {
    const m = await this.ensure(symbol);
    if (m.outcome || (m.closesAt && Date.parse(m.closesAt) <= Date.now())) return { symbol, askMicros: null, bidMicros: null, tickMicros: TICK };
    return { symbol, askMicros: m.askMicros, bidMicros: m.askMicros > SPREAD ? m.askMicros - SPREAD : null, tickMicros: TICK };
  }

  async buyYes(p: { symbol: string; contracts: number; limitPriceMicros: bigint; clientOrderId: string }): Promise<OrderResult> {
    const existing = this.orders.get(p.clientOrderId);
    if (existing) return existing;
    const m = await this.ensure(p.symbol);
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

  /** A known market, or a practice game rebuilt from its symbol (after a restart). Never creates other symbols. */
  private known(symbol: string): MockMarket | undefined {
    let m = this.markets.get(symbol);
    if (!m) {
      m = practiceFromSymbol(symbol) ?? undefined;
      if (m) this.markets.set(symbol, m);
    }
    return m;
  }

  async getMarket(symbol: string): Promise<MarketSummary | null> {
    const m = this.known(symbol);
    return m ? toSummary(m) : null;
  }

  async resolution(symbol: string): Promise<Resolution> {
    const m = this.known(symbol);
    // Practice games settle themselves a minute after the final, weighted by their price (unless an admin already did).
    if (m && !m.outcome && isPractice(m.symbol) && m.closesAt && Date.now() >= Date.parse(m.closesAt) + 60_000) {
      this.resolve(m.symbol, Math.random() * 1_000_000 < Number(m.askMicros) ? 'yes' : 'no');
    }
    return m?.outcome ? { resolved: true, outcome: m.outcome } : { resolved: false };
  }

  // ---- practice games (SIMULATED fallback when the real venue has no sellers) ----

  /** Keep two rolling practice games open, each closing at the next half hour that is ≥ 40 minutes away. */
  practiceGames(now = Date.now()): MarketSummary[] {
    const close = new Date(now + 40 * 60_000);
    close.setSeconds(0, 0);
    close.setMinutes(close.getMinutes() < 30 ? 30 : 60);
    const stamp = close.toISOString().slice(0, 16).replace(/[-:T]/g, '');
    for (const [team, name, ask] of PRACTICE_TEAMS) {
      // If this slot's game was already ended by hand (e.g. "Bitcoin wins" in a demo), open a fresh one.
      let symbol = `${PRACTICE_PREFIX}${team}-${stamp}`;
      for (let n = 2; this.markets.get(symbol)?.outcome; n++) symbol = `${PRACTICE_PREFIX}${team}-${stamp}-${n}`;
      if (!this.markets.has(symbol)) {
        this.markets.set(symbol, {
          symbol,
          title: `${team} price today — Up`,
          condition: `${name} finishes up (practice game)`,
          category: 'practice',
          askMicros: ask,
          closesAt: close.toISOString(),
          outcome: null,
          adHoc: true, // not in the general mock list; offered only as practice
        });
      }
    }
    return [...this.markets.values()]
      .filter((m) => isPractice(m.symbol) && !m.outcome && m.closesAt && Date.parse(m.closesAt) > now)
      .map(toSummary);
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
