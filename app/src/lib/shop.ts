'use client';

import { premiumBpsFor, priceToMicros, parseUsd } from '@oth/shared';
import { shopSaveMessage, type MarketSummary, type ShopItem, type ShopProfile } from '@oth/shared/api';
import { engine, getJson } from './client';
import type { Owner } from './owner';

export const DEFAULT_ITEMS: ShopItem[] = [
  { id: 'coffee', name: 'Coffee', price: '3000000' },
  { id: 'latte', name: 'Latte', price: '4500000' },
  { id: 'cookie', name: 'Cookie', price: '2000000' },
];
export const DEMO_SHOP: Omit<ShopProfile, 'merchant' | 'updatedAt'> = { name: 'UBC Coffee Cart', items: DEFAULT_ITEMS };
export const PLATFORM_MARGIN_BPS = 1000;

export async function loadShop(address: string): Promise<ShopProfile | null> {
  return engine<ShopProfile>(`/shops/${address}`).catch(() => null);
}

/** Save name + menu. Privy owners sign the change with their own wallet; the demo shop is signed by the server. */
export async function saveShop(owner: Owner, name: string, items: ShopItem[]): Promise<ShopProfile> {
  if (owner.mode === 'demo' || !owner.signMessage || !owner.address) {
    return getJson<ShopProfile>('/api/shop', { method: 'PUT', body: JSON.stringify({ name, items }) });
  }
  const timestamp = Date.now();
  const signature = await owner.signMessage(shopSaveMessage(owner.address, name, items, timestamp));
  return engine<ShopProfile>(`/shops/${owner.address}`, { method: 'PUT', body: JSON.stringify({ name, items, timestamp, signature }) });
}

export interface LaunchParams {
  marketSymbol: string;
  refundPct: number;
  maxCostPct: number;
  liabilityCapUsd: number;
  maxUnhedgedUsd: number;
  deadlineMinutes: number;
}

/** Launch a promo. Privy owners co-sign the launch with their wallet (we pay the fees). */
export async function launchPromo(owner: Owner, p: LaunchParams): Promise<{ campaign: string }> {
  if (owner.mode === 'demo' || !owner.signTransaction || !owner.address) {
    return getJson<{ campaign: string }>('/api/campaigns', { method: 'POST', body: JSON.stringify(p) });
  }
  const built = await getJson<{ campaign: string; transaction: string }>('/api/campaigns', {
    method: 'POST',
    body: JSON.stringify({ ...p, merchant: owner.address }),
  });
  const bytes = Uint8Array.from(atob(built.transaction), (c) => c.charCodeAt(0));
  const signed = await owner.signTransaction(bytes);
  let bin = '';
  for (const b of signed) bin += String.fromCharCode(b);
  await getJson('/api/submit', { method: 'POST', body: JSON.stringify({ transaction: btoa(bin) }) });
  return { campaign: built.campaign };
}

/** Markets that can be protected right now (someone is selling at a fair price, and it isn't about to close). */
export function tradable(markets: MarketSummary[], minMinutesLeft = 20): MarketSummary[] {
  const soonest = Date.now() + minMinutesLeft * 60_000;
  return markets.filter((m) => m.yesAsk && Number(m.yesAsk) >= 0.1 && Number(m.yesAsk) <= 0.7 && (!m.closesAt || Date.parse(m.closesAt) >= soonest));
}

/** Smart default: the next game that's cheap enough to make “free” affordable, Bitcoin first. */
export function pickNextGame(markets: MarketSummary[]): MarketSummary | null {
  const list = tradable(markets);
  if (!list.length) return null;
  const score = (m: MarketSummary) =>
    (m.closesAt ? Date.parse(m.closesAt) / 60_000 : 1e12) + Math.abs(Number(m.yesAsk) - 0.3) * 120 + (/^BTC /.test(m.title) ? 0 : 15);
  return [...list].sort((a, b) => score(a) - score(b))[0]!;
}

/** Cost of an offer as % of each sale, and a suggested offer for a game. */
export function costBps(refundPct: number, yesAsk: string): number {
  return premiumBpsFor(Math.round(refundPct * 100), priceToMicros(yesAsk), PLATFORM_MARGIN_BPS);
}
export function suggestedRefundPct(yesAsk: string): number {
  const c = costBps(100, yesAsk);
  return c <= 3500 ? 100 : c <= 6000 ? 50 : 25;
}
/** Headroom so a small price move doesn't pause the promo, without letting the hedge price exceed $0.99. */
export function defaultMaxCostPct(refundPct: number, yesAsk: string): number {
  const cost = costBps(refundPct, yesAsk) / 100;
  return Math.min(100, Math.ceil(cost * 1.3));
}
export function offerText(refundPct: number): string {
  return refundPct >= 100 ? 'Their order is free' : `They get ${refundPct}% back`;
}
export const toCents = (usd: string | number) => parseUsd(String(usd));

/** Round USDC base units to whole cents for display ("$0.89", not "$0.89375"). */
export function cents(baseUnits: bigint | string | number): bigint {
  const v = BigInt(baseUnits);
  return ((v + 5_000n) / 10_000n) * 10_000n;
}
