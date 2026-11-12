import { createHmac } from 'node:crypto';
import { GEMINI_SANDBOX_HOST, microsToPrice, priceToMicros } from '@oth/shared';
import type { GeminiPublic } from './gemini-public';
import type { MarketQuote, OrderResult, Venue } from './types';

/**
 * Gemini Prediction Markets trading client — SANDBOX ONLY.
 * Docs: docs/research/gemini/{authentication-api-key.md, trading-quickstart.md, order-lifecycle.md, prediction-markets.yaml}.
 *
 * Private REST calls (per the API-key auth doc): empty body, `Content-Type: text/plain`, JSON payload
 * `{ request, nonce, ...params }` base64-encoded in `X-GEMINI-PAYLOAD`, signed as
 * hex(HMAC-SHA384(base64Payload, secret)) in `X-GEMINI-SIGNATURE`. Master keys add `account` (subaccount shortname).
 *
 * Hedges are limit buys of YES with `immediate-or-cancel`: they take what's available at or below the limit and
 * never leave a resting order. The order API has no client order id, so after a transport failure we reconcile
 * through order history before deciding nothing traded (as the quickstart instructs).
 */

export class SandboxOnlyError extends Error {
  constructor(host: string) {
    super(`Refusing to trade against ${host}: Gemini trading is sandbox-only (${GEMINI_SANDBOX_HOST}).`);
    this.name = 'SandboxOnlyError';
  }
}

export class GeminiApiError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string,
    message: string,
  ) {
    super(`Gemini ${status} ${reason}: ${message}`);
    this.name = 'GeminiApiError';
  }
}

// ---- response types (from the OpenAPI spec; checked against engine/fixtures/gemini/sandbox-*.json) ----
export interface GeminiOrder {
  /** 64-bit id, kept as a digit string (it does not fit a JS number). */
  orderId: string | number;
  clientOrderId?: string | null;
  status: 'open' | 'filled' | 'cancelled';
  symbol: string;
  side: 'buy' | 'sell';
  outcome: 'yes' | 'no';
  orderType: string;
  quantity: string;
  filledQuantity: string;
  remainingQuantity: string;
  price: string;
  avgExecutionPrice: string | null;
  createdAt: string;
  updatedAt?: string;
  cancelledAt?: string | null;
}
export interface GeminiPosition {
  symbol: string;
  totalQuantity: string;
  quantityOnHold?: string;
  avgPrice: string;
  outcome: 'yes' | 'no';
  resolutionSide?: 'yes' | 'no' | null;
  marketValue?: string;
}
export interface GeminiSettledPosition {
  instrumentSymbol: string;
  positionQuantity: string;
  outcome: 'yes' | 'no';
  payout: string;
  resolutionSide: 'yes' | 'no';
  settledAt: string;
  costBasis?: string | null;
  netProfit?: string | null;
}
export interface TermsStatus {
  hasAcceptedLatest: boolean;
  acceptedVersion: number | null;
  latestVersion: number;
}

export interface GeminiSandboxOptions {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
  /** Subaccount shortname for master keys (defaults to "primary" for `master-` keys). */
  account?: string;
  /** Public data (sandbox host) for quotes and contract increments. */
  market: GeminiPublic;
  timeoutMs?: number;
}

export class GeminiSandbox implements Venue {
  readonly simulated = false;
  private readonly baseUrl: string;
  private readonly account: string | undefined;
  private lastNonce = 0;

  constructor(private readonly o: GeminiSandboxOptions) {
    const host = new URL(o.baseUrl).hostname;
    if (host !== GEMINI_SANDBOX_HOST) throw new SandboxOnlyError(host);
    if (!o.apiKey || !o.apiSecret) throw new Error('GEMINI_API_KEY and GEMINI_API_SECRET are required for GEMINI_MODE=sandbox');
    this.baseUrl = o.baseUrl.replace(/\/$/, '');
    this.account = o.account || (o.apiKey.startsWith('master-') ? 'primary' : undefined);
  }

  /** Nonce that works for both key modes: unix seconds (time-based keys), strictly increasing (incremental keys). */
  private nonce(): number {
    this.lastNonce = Math.max(Math.floor(Date.now() / 1000), this.lastNonce + 1);
    return this.lastNonce;
  }

  /** Signed private request. Trading paths are re-checked against the sandbox host on every call. */
  async private<T>(path: string, params: Record<string, unknown> = {}, method: 'POST' | 'GET' = 'POST'): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (url.hostname !== GEMINI_SANDBOX_HOST) throw new SandboxOnlyError(url.hostname);
    // Order ids exceed 2^53: callers pass them as digit strings and they are written as raw JSON numbers here.
    const json = JSON.stringify({ request: path, nonce: this.nonce(), ...(this.account ? { account: this.account } : {}), ...params }).replace(
      /("orderId"\s*:\s*)"(\d+)"/g,
      '$1$2',
    );
    const payload = Buffer.from(json).toString('base64');
    const signature = createHmac('sha384', this.o.apiSecret).update(payload).digest('hex');
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'text/plain',
        'Content-Length': '0',
        'X-GEMINI-APIKEY': this.o.apiKey,
        'X-GEMINI-PAYLOAD': payload,
        'X-GEMINI-SIGNATURE': signature,
        'Cache-Control': 'no-cache',
      },
      signal: AbortSignal.timeout(this.o.timeoutMs ?? 10_000),
    });
    const text = await res.text();
    let body: unknown = null;
    try {
      // Keep 64-bit order ids exact: quote them before JSON.parse turns them into lossy doubles.
      body = text ? JSON.parse(text.replace(/("(?:orderId|globalOrderId|accountId|instrumentId)"\s*:\s*)(\d{16,})/g, '$1"$2"')) : null;
    } catch {
      /* non-JSON error page */
    }
    if (!res.ok) {
      const b = (body ?? {}) as { reason?: string; error?: string; message?: string };
      throw new GeminiApiError(res.status, b.reason ?? b.error ?? 'Error', b.message ?? text.slice(0, 200));
    }
    return body as T;
  }

  // ---- account ----

  termsStatus(): Promise<TermsStatus> {
    return this.private<TermsStatus>('/v1/prediction-markets/terms/status', {}, 'GET');
  }

  acceptTerms(): Promise<{ success: boolean }> {
    return this.private('/v1/prediction-markets/terms/accept');
  }

  async positions(): Promise<GeminiPosition[]> {
    return (await this.private<{ positions: GeminiPosition[] }>('/v1/prediction-markets/positions')).positions;
  }

  async settledPositions(eventTicker?: string): Promise<{ positions: GeminiSettledPosition[]; totalPayout?: string }> {
    return this.private('/v1/prediction-markets/positions/settled', eventTicker ? { eventTicker } : {});
  }

  async activeOrders(symbol?: string): Promise<GeminiOrder[]> {
    const r = await this.private<GeminiOrder[] | { orders: GeminiOrder[] }>('/v1/prediction-markets/orders/active', symbol ? { symbol } : {});
    return Array.isArray(r) ? r : r.orders ?? [];
  }

  async orderHistory(symbol?: string): Promise<GeminiOrder[]> {
    const r = await this.private<GeminiOrder[] | { orders: GeminiOrder[] }>('/v1/prediction-markets/orders/history', symbol ? { symbol } : {});
    return Array.isArray(r) ? r : r.orders ?? [];
  }

  /** Refuses to trade unless the account has accepted the latest Prediction Markets terms. */
  async assertReady(): Promise<TermsStatus> {
    const t = await this.termsStatus();
    if (!t.hasAcceptedLatest) {
      throw new Error(`Gemini sandbox account has not accepted Prediction Markets terms v${t.latestVersion}. Accept them (pnpm gemini:probe --accept-terms) first.`);
    }
    return t;
  }

  // ---- Venue ----

  async quote(symbol: string): Promise<MarketQuote> {
    const c = await this.o.market.getContract(symbol);
    const ask = c?.prices?.bestAsk ?? c?.prices?.buy?.yes ?? null;
    const bid = c?.prices?.bestBid ?? c?.prices?.sell?.yes ?? null;
    const open = c?.status === 'active' && (c.marketState ?? 'open') === 'open';
    return {
      symbol,
      askMicros: open && ask ? priceToMicros(ask) : null,
      bidMicros: open && bid ? priceToMicros(bid) : null,
      tickMicros: c?.priceIncrement ? priceToMicros(c.priceIncrement) : 10_000n,
    };
  }

  async buyYes(p: { symbol: string; contracts: number; limitPriceMicros: bigint; clientOrderId: string }): Promise<OrderResult> {
    if (!Number.isInteger(p.contracts) || p.contracts <= 0) throw new Error(`contracts must be a positive integer (got ${p.contracts})`);
    const startedAt = Date.now();
    const params = {
      symbol: p.symbol,
      orderType: 'limit',
      side: 'buy',
      outcome: 'yes',
      quantity: String(p.contracts),
      price: microsToPrice(p.limitPriceMicros),
      timeInForce: 'immediate-or-cancel',
    };
    let order: GeminiOrder;
    try {
      order = await this.private<GeminiOrder>('/v1/prediction-markets/order', params);
    } catch (e) {
      if (e instanceof GeminiApiError) {
        return { orderId: '', clientOrderId: p.clientOrderId, filledContracts: 0, avgPriceMicros: 0n, state: 'rejected', reason: `${e.reason}: ${e.message}` };
      }
      // Timeout / transport error: the order may still have been accepted. Reconcile before giving up.
      const found = await this.findRecentOrder(p.symbol, p.contracts, params.price, startedAt).catch(() => null);
      if (!found) throw e;
      order = found;
    }
    return toOrderResult(order, p.clientOrderId);
  }

  /** Our IOC order placed at/after `since` with the same symbol, quantity and limit — used after a lost response. */
  private async findRecentOrder(symbol: string, quantity: number, price: string, since: number): Promise<GeminiOrder | null> {
    const all = [...(await this.activeOrders(symbol)), ...(await this.orderHistory(symbol))];
    return (
      all.find(
        (o) =>
          o.symbol === symbol &&
          o.side === 'buy' &&
          o.outcome === 'yes' &&
          Number(o.quantity) === quantity &&
          priceToMicros(o.price) === priceToMicros(price) &&
          Date.parse(o.createdAt) >= since - 5_000,
      ) ?? null
    );
  }

  async cancel(orderId: string): Promise<void> {
    if (!orderId) return;
    await this.private('/v1/prediction-markets/order/cancel', { orderId: String(orderId) });
  }
}

/**
 * IOC fills can be fractional (quantity increment 0.01). The program records whole contracts, so we record the floor;
 * any fractional remainder stays as extra (unrecorded) coverage held at Gemini.
 */
export function toOrderResult(o: GeminiOrder, clientOrderId: string): OrderResult {
  const filled = Math.floor(Number(o.filledQuantity) + 1e-9);
  const avg = o.avgExecutionPrice ? priceToMicros(o.avgExecutionPrice) : priceToMicros(o.price);
  const state: OrderResult['state'] = filled >= Number(o.quantity) ? 'filled' : o.status === 'open' ? 'open' : 'rejected';
  return {
    orderId: String(o.orderId),
    clientOrderId,
    filledContracts: filled,
    avgPriceMicros: filled > 0 ? avg : 0n,
    state,
    reason: filled < Number(o.quantity) ? `filled ${o.filledQuantity}/${o.quantity} at ≤ $${o.price} (${o.status})` : undefined,
  };
}
