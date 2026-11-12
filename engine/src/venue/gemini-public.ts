import { GEMINI_PRODUCTION_HOST, GEMINI_SANDBOX_HOST } from '@oth/shared';
import type { MarketStatus, MarketSummary } from '@oth/shared/api';
import type { MarketSource, Resolution } from './types';

/**
 * Read-only Gemini Prediction Markets public data (no auth). Docs: docs/research/gemini/ (OpenAPI spec
 * `prediction-markets.yaml`, operations listEvents / getEvent). Samples: engine/fixtures/gemini/.
 * Reading from production is allowed by the brief; this class never places orders.
 */

// ---- response types (from the OpenAPI spec, checked against the fixtures) ----
export interface GeminiContract {
  id: string;
  label: string;
  status: GeminiMarketStatus;
  instrumentSymbol: string;
  ticker?: string;
  expiryDate: string | null;
  /** Absent on active contracts (see fixtures); 'yes' | 'no' once settled. */
  resolutionSide?: 'yes' | 'no' | null;
  resolvedAt?: string | null;
  marketState?: string;
  priceIncrement?: string;
  priceMinimum?: string;
  quantityIncrement?: string;
  quantityMinimum?: string;
  prices?: {
    buy?: { yes?: string; no?: string };
    sell?: { yes?: string; no?: string };
    bestBid?: string | null;
    bestAsk?: string | null;
    lastTradePrice?: string | null;
  };
}
export type GeminiMarketStatus = 'approved' | 'active' | 'closed' | 'under_review' | 'settled' | 'invalid';
export interface GeminiEvent {
  id: string;
  title: string;
  ticker: string;
  type: 'binary' | 'categorical';
  category: string;
  status: GeminiMarketStatus;
  expiryDate: string | null;
  resolvedAt?: string | null;
  contracts: GeminiContract[];
}
interface EventsResponse {
  data: GeminiEvent[];
  pagination: { limit: number; offset: number; total: number };
}

const LIST_TTL_MS = 15_000;
const EVENT_TTL_MS = 5_000;

export class GeminiPublic implements MarketSource {
  readonly simulated = false;
  private list: { at: number; markets: MarketSummary[] } | null = null;
  private readonly events = new Map<string, { at: number; event: GeminiEvent | null }>();
  /** instrumentSymbol → event ticker, learned from listings (preferred over parsing the symbol). */
  private readonly eventOf = new Map<string, string>();

  constructor(private readonly baseUrl: string) {
    const host = new URL(baseUrl).hostname;
    if (host !== GEMINI_PRODUCTION_HOST && host !== GEMINI_SANDBOX_HOST) throw new Error(`unexpected Gemini host ${host}`);
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Gemini ${path} → HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  async listMarkets(): Promise<MarketSummary[]> {
    if (this.list && Date.now() - this.list.at < LIST_TTL_MS) return this.list.markets;
    const out: MarketSummary[] = [];
    const res = await this.get<EventsResponse>('/v1/prediction-markets/events?status=active&limit=100');
    for (const ev of res.data) {
      for (const c of ev.contracts) {
        if (c.status !== 'active') continue;
        this.eventOf.set(c.instrumentSymbol, ev.ticker);
        out.push(toSummary(ev, c));
      }
    }
    // Soonest-closing first: those are the ones a live demo can settle.
    out.sort((a, b) => (a.closesAt ?? '9999').localeCompare(b.closesAt ?? '9999'));
    this.list = { at: Date.now(), markets: out };
    return out;
  }

  async getEvent(ticker: string): Promise<GeminiEvent | null> {
    const hit = this.events.get(ticker);
    if (hit && Date.now() - hit.at < EVENT_TTL_MS) return hit.event;
    let event: GeminiEvent | null = null;
    try {
      event = await this.get<GeminiEvent>(`/v1/prediction-markets/events/${encodeURIComponent(ticker)}`);
    } catch (e) {
      if (!/HTTP 404/.test((e as Error).message)) throw e;
    }
    this.events.set(ticker, { at: Date.now(), event });
    return event;
  }

  /** Event tickers to try for a symbol: learned mapping first, else strip "GEMI-" and the contract suffix. */
  private candidateTickers(symbol: string): string[] {
    const known = this.eventOf.get(symbol);
    if (known) return [known];
    const body = symbol.replace(/^GEMI-/, '');
    const parts = body.split('-');
    const out: string[] = [];
    for (let i = parts.length - 1; i >= 1; i--) out.push(parts.slice(0, i).join('-'));
    return out;
  }

  /** The event + raw contract for an instrument symbol (prices, increments, market state). */
  async getContractWithEvent(symbol: string): Promise<{ event: GeminiEvent; contract: GeminiContract } | null> {
    if (!symbol.startsWith('GEMI-')) return null;
    for (const t of this.candidateTickers(symbol)) {
      const ev = await this.getEvent(t);
      const c = ev?.contracts.find((x) => x.instrumentSymbol === symbol);
      if (ev && c) {
        this.eventOf.set(symbol, ev.ticker);
        return { event: ev, contract: c };
      }
    }
    return null;
  }

  async getContract(symbol: string): Promise<GeminiContract | null> {
    return (await this.getContractWithEvent(symbol))?.contract ?? null;
  }

  async getMarket(symbol: string): Promise<MarketSummary | null> {
    const hit = await this.getContractWithEvent(symbol);
    return hit ? toSummary(hit.event, hit.contract) : null;
  }

  async resolution(symbol: string): Promise<Resolution> {
    const m = await this.getMarket(symbol);
    return m?.status === 'resolved' && m.outcome ? { resolved: true, outcome: m.outcome } : { resolved: false };
  }
}

function mapStatus(s: GeminiMarketStatus, side: 'yes' | 'no' | null): MarketStatus {
  if (s === 'settled' && side) return 'resolved';
  return s === 'active' ? 'open' : 'closed';
}

export function toSummary(ev: GeminiEvent, c: GeminiContract): MarketSummary {
  const p = c.prices ?? {};
  const single = ev.contracts.length === 1;
  return {
    symbol: c.instrumentSymbol,
    eventId: ev.ticker,
    title: single && c.label === ev.title ? ev.title : `${ev.title} — ${c.label}`,
    condition: plainCondition(ev, c),
    category: ev.category,
    yesAsk: p.bestAsk ?? p.buy?.yes ?? null,
    yesBid: p.bestBid ?? p.sell?.yes ?? null,
    closesAt: c.expiryDate ?? ev.expiryDate,
    status: mapStatus(c.status, c.resolutionSide ?? null),
    outcome: c.resolutionSide ?? null,
    simulated: false,
    source: 'gemini',
  };
}

/**
 * Best-effort plain language for the shop banner ("…if {condition}"), e.g.
 *   "BTC price today at 4pm EST" + "$73,500 or above" → "BTC is $73,500 or above today at 4pm EST"
 *   "ETH price today at 3:20pm EST" + "Up"             → "ETH is up today at 3:20pm EST"
 *   "Will X happen?" + "Yes"                           → "X happen"   (question form)
 */
export function plainCondition(ev: Pick<GeminiEvent, 'title' | 'contracts'>, c: Pick<GeminiContract, 'label'>): string {
  const t = ev.title.trim().replace(/\?$/, '');
  const label = c.label.trim();
  const price = /^(.+?) price (.+)$/i.exec(t);
  if (price) {
    const what = /^(up|down)$/i.test(label) ? label.toLowerCase() : label;
    return `${price[1]} is ${what} ${price[2]}`;
  }
  if (/^will\s/i.test(t) && /^yes$/i.test(label)) return t.replace(/^will\s/i, '');
  if (ev.contracts.length === 1 && /^yes$/i.test(label)) return t;
  return `${label} (${t})`;
}
