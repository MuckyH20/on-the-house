/**
 * Engine HTTP API contract (consumed by the web app and scripts).
 * All USDC amounts are base-unit decimal strings; prices are dollars-per-$1-contract strings ("0.27")
 * plus integer micro-dollar strings ("270000").
 */
import type { CampaignStatusName, CampaignView, OthEventName, OutcomeName } from './program';

export type { CampaignStatusName, CampaignView, OthEventName, OutcomeName };

export interface SimulatedFlags {
  /** Hedges are placed on the in-memory mock order book (GEMINI_MODE=mock). */
  gemini: boolean;
  /** Market resolution comes from the mock admin endpoint (RESOLUTION_SOURCE=mock). */
  resolution: boolean;
}

export interface EngineInfo {
  ok: true;
  cluster: 'devnet' | 'localnet';
  programId: string;
  usdcMint: string;
  treasury: string;
  operator: string;
  platformMarginBps: number;
  geminiMode: 'mock' | 'sandbox';
  ingestMode: 'poll' | 'quicknode';
  resolutionSource: 'mock' | 'production' | 'sandbox';
  simulated: SimulatedFlags;
}

export type MarketStatus = 'open' | 'closed' | 'resolved';

export interface MarketSummary {
  /** Instrument symbol hedges are bought on (the YES contract). */
  symbol: string;
  /** Venue event identifier, when the venue groups contracts into events. */
  eventId: string | null;
  /** Venue title, e.g. "BTC above $100,000 on Nov 20, 3:00 PM ET?" */
  title: string;
  /** Plain-language condition for customers: "Bitcoin is above $100,000 at 3:00 PM ET on Nov 20". */
  condition: string;
  category: string;
  yesAsk: string | null;
  yesBid: string | null;
  /** When trading closes / the event resolves (ISO 8601). */
  closesAt: string | null;
  status: MarketStatus;
  outcome: 'yes' | 'no' | null;
  /** True for markets that only exist in the mock venue. */
  simulated: boolean;
  source: 'gemini' | 'mock';
}

export interface Quote {
  campaign: string;
  marketSymbol: string;
  yesAsk: string | null;
  askMicros: string | null;
  /** Premium as bps of the sale at the live price (refund_bps × ask × (1 + margin)). */
  premiumBps: number | null;
  refundBps: number;
  maxPremiumBps: number;
  /** Highest YES price at which this promo stays within the merchant's max cost per sale. */
  maxPriceMicros: string;
  /** True when sales are paused on-chain, by the hedger, or because the price is above the cap. */
  paused: boolean;
  available: boolean;
  /** Plain-language reason when not available. */
  reason: string | null;
  simulated: SimulatedFlags;
  /** Present when `?amount=` (base units) was passed. */
  amount?: string;
  premium?: string;
  refund?: string;
  quotedAt: number;
}

export type FillStatus = 'placed' | 'filled' | 'recorded' | 'failed' | 'cancelled';

export interface HedgeFill {
  id: string;
  campaign: string;
  /** Venue order id (Gemini order id, or a mock id when simulated). */
  orderId: string;
  clientOrderId: string;
  symbol: string;
  contracts: number;
  priceMicros: string;
  /** record_hedge transaction signature once the fill is recorded on-chain. */
  recordTx: string | null;
  status: FillStatus;
  simulated: boolean;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface StoredEvent {
  signature: string;
  index: number;
  slot: number;
  name: OthEventName;
  campaign: string | null;
  data: Record<string, string | number | boolean>;
  blockTime: number | null;
  source: 'ws' | 'backfill' | 'quicknode';
  receivedAt: number;
}

export type HedgerStateName = 'idle' | 'hedging' | 'retrying' | 'failed' | 'stopped';

export interface HedgerStatus {
  state: HedgerStateName;
  /** Contracts ordered but not yet recorded on-chain. */
  pendingContracts: number;
  maxPriceMicros: string;
  lastError: string | null;
  /** True when the hedger paused sales because it could not fill under the max price. */
  pausedByHedger: boolean;
}

export type SettlementStateName = 'waiting' | 'settling' | 'funding' | 'paying' | 'done' | 'failed';

export interface SettlementStatus {
  state: SettlementStateName;
  outcome: 'yes' | 'no' | null;
  holders: number;
  paid: number;
  lastError: string | null;
}

/** What the trading venue itself reports for a campaign's market (Gemini sandbox mode only). */
export interface VenueProof {
  source: 'gemini-sandbox';
  /** YES contracts held at Gemini for this symbol (all campaigns on the symbol share the position). */
  positionContracts: string | null;
  /** Gemini's settled-position payout for this symbol, in dollars ("5.00"), once the market settles. */
  settledPayout: string | null;
  resolutionSide: 'yes' | 'no' | null;
  settledAt: string | null;
  checkedAt: number;
  error: string | null;
}

export interface CampaignState {
  campaign: CampaignView;
  market: MarketSummary | null;
  /** Refunds promised (on-chain liability), base units. */
  promised: string;
  /** Refunds covered (on-chain hedged_contracts × $1), base units. */
  covered: string;
  unhedged: string;
  coverageBps: number;
  fills: HedgeFill[];
  /** Most recent first. */
  events: StoredEvent[];
  hedger: HedgerStatus;
  settlement: SettlementStatus;
  /** Present in GEMINI_MODE=sandbox. */
  venue?: VenueProof;
  simulated: SimulatedFlags;
  updatedAt: number;
}

export interface CampaignSummary {
  campaign: CampaignView;
  market: MarketSummary | null;
  coverageBps: number;
  hedger: HedgerStatus;
  settlement: SettlementStatus;
}

export interface WalletPurchase {
  signature: string;
  amount: string;
  premium: string;
  refund: string;
  at: number | null;
}

export interface WalletClaim {
  campaign: string;
  marketSymbol: string;
  market: MarketSummary | null;
  refundBps: number;
  purchases: WalletPurchase[];
  /** Refund still owed (on-chain claim balance). */
  claimBalance: string;
  /** Total refunds paid to this wallet. */
  paidOut: string;
  status: CampaignStatusName;
  outcome: OutcomeName;
}

/** A shop's public profile (name + menu), owned by the merchant wallet. */
export interface ShopItem {
  id: string;
  name: string;
  /** Price in USDC base units (decimal string). */
  price: string;
}
export interface ShopProfile {
  merchant: string;
  name: string;
  items: ShopItem[];
  updatedAt: number;
}
export interface ShopSaveRequest {
  name: string;
  items: ShopItem[];
  /** unix ms; must be within 5 minutes of the server clock */
  timestamp: number;
  /** base58 ed25519 signature by the merchant wallet over shopSaveMessage(...) */
  signature: string;
}

/** The exact text a shop owner signs to save their profile (shown in their wallet if it asks). */
export function shopSaveMessage(merchant: string, name: string, items: ShopItem[], timestamp: number): string {
  return `On the House — save my shop\nwallet: ${merchant}\nname: ${name}\nitems: ${JSON.stringify(items)}\ntime: ${timestamp}`;
}

/** An order's items and pickup status (off-chain; the payment itself is the on-chain purchase). */
export type OrderStatus = 'new' | 'ready' | 'done';
export interface OrderLine {
  id: string;
  name: string;
  qty: number;
  /** unit price, USDC base units */
  price: string;
}
export interface ShopOrder {
  /** purchase transaction signature (the order id; short number = first 5 chars) */
  signature: string;
  campaign: string;
  buyer: string;
  amount: string;
  refund: string;
  lines: OrderLine[];
  status: OrderStatus;
  createdAt: number;
  updatedAt: number;
}
/** The exact text a shop owner signs to change an order's status. */
export function orderStatusMessage(merchant: string, signature: string, status: OrderStatus, timestamp: number): string {
  return `On the House — order ${signature} is ${status}\nwallet: ${merchant}\ntime: ${timestamp}`;
}

/** What a shop signs to end its own practice game early ("yes" = the team wins). */
export function practiceFinishMessage(merchant: string, campaign: string, outcome: 'yes' | 'no', timestamp: number): string {
  return `On the House — end practice game for promo ${campaign}: ${outcome === 'yes' ? 'team wins' : 'team loses'}\nwallet: ${merchant}\ntime: ${timestamp}`;
}

export interface ApiError {
  error: string;
}
