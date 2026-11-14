import {
  BPS_DENOMINATOR,
  CONTRACT_PAYOUT_BASE_UNITS,
  PRICE_MICROS_PER_DOLLAR,
  USDC_DECIMALS,
  USDC_UNIT,
} from './constants';

/**
 * All money math lives here so the program, engine, app and scripts agree to the base unit.
 * Amounts are USDC base units (bigint). Prices are integer micro-dollars per $1 contract.
 */

export function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error('ceilDiv: denominator must be positive');
  if (numerator <= 0n) return 0n;
  return (numerator + denominator - 1n) / denominator;
}

/** refund = amount × refund_bps / 10_000 (floor). Mirrors the on-chain `purchase` math exactly. */
export function refundFor(amount: bigint, refundBps: number): bigint {
  return (amount * BigInt(refundBps)) / BPS_DENOMINATOR;
}

/** On-chain premium cap: amount × max_premium_bps / 10_000 (floor). `purchase` rejects anything above. */
export function maxPremiumFor(amount: bigint, maxPremiumBps: number): bigint {
  return (amount * BigInt(maxPremiumBps)) / BPS_DENOMINATOR;
}

/** Hedge target: ceil(liability / 1_000_000) contracts (each pays $1 on YES). */
export function contractsToCover(liability: bigint): bigint {
  return ceilDiv(liability, CONTRACT_PAYOUT_BASE_UNITS);
}

/** Refunds promised but not yet covered by hedged contracts (saturating), as enforced on-chain. */
export function unhedgedLiability(liability: bigint, hedgedContracts: bigint): bigint {
  const covered = hedgedContracts * CONTRACT_PAYOUT_BASE_UNITS;
  return liability > covered ? liability - covered : 0n;
}

/** Coverage in basis points (10_000 = 100%). Zero liability counts as fully covered. */
export function coverageBps(liability: bigint, hedgedContracts: bigint): number {
  if (liability === 0n) return 10_000;
  const covered = hedgedContracts * CONTRACT_PAYOUT_BASE_UNITS;
  if (covered >= liability) return 10_000;
  return Number((covered * BPS_DENOMINATOR) / liability);
}

/**
 * Premium for one sale:
 *   premium = amount × refund_bps × ask × (1 + PLATFORM_MARGIN_BPS)
 * with ask = YES price in dollars per $1 contract. Rounded up to the base unit.
 */
export function rawPremiumFor(
  amount: bigint,
  refundBps: number,
  askMicros: bigint,
  platformMarginBps: number,
): bigint {
  const numerator = amount * BigInt(refundBps) * askMicros * (BPS_DENOMINATOR + BigInt(platformMarginBps));
  const denominator = BPS_DENOMINATOR * PRICE_MICROS_PER_DOLLAR * BPS_DENOMINATOR;
  return ceilDiv(numerator, denominator);
}

/** Premium as basis points of the sale amount (rounded up). */
export function premiumBpsFor(refundBps: number, askMicros: bigint, platformMarginBps: number): number {
  const numerator = BigInt(refundBps) * askMicros * (BPS_DENOMINATOR + BigInt(platformMarginBps));
  const denominator = PRICE_MICROS_PER_DOLLAR * BPS_DENOMINATOR;
  return Number(ceilDiv(numerator, denominator));
}

/**
 * Highest YES price (micros) at which hedging still keeps the per-sale cost within the merchant's cap:
 *   refund_bps × p × (1 + margin) ≤ max_premium_bps  ⇒  p ≤ max_premium_bps / (refund_bps × (1 + margin))
 * Floors to the micro; callers round down to the venue's tick size.
 */
export function maxHedgePriceMicros(maxPremiumBps: number, refundBps: number, platformMarginBps: number): bigint {
  if (refundBps <= 0) return 0n;
  const numerator = BigInt(maxPremiumBps) * PRICE_MICROS_PER_DOLLAR * BPS_DENOMINATOR;
  const denominator = BigInt(refundBps) * (BPS_DENOMINATOR + BigInt(platformMarginBps));
  const p = numerator / denominator;
  return p > PRICE_MICROS_PER_DOLLAR ? PRICE_MICROS_PER_DOLLAR : p;
}

/** Round a price down to a tick (both in micros). */
export function floorToTick(priceMicros: bigint, tickMicros: bigint): bigint {
  if (tickMicros <= 0n) return priceMicros;
  return (priceMicros / tickMicros) * tickMicros;
}

export interface PremiumQuote {
  /** Premium in USDC base units the customer pays to the platform treasury for this sale. */
  premium: bigint;
  /** Premium as bps of the amount (display). */
  premiumBps: number;
  /** Refund the customer would receive on YES. */
  refund: bigint;
  /** The on-chain cap for this amount. */
  maxPremium: bigint;
  /** False when the live price makes the promo cost more than the merchant allowed. */
  withinCap: boolean;
}

/** Quote one sale. When the price is within the cap, rounding never pushes the premium over the on-chain cap. */
export function quoteSale(params: {
  amount: bigint;
  refundBps: number;
  maxPremiumBps: number;
  askMicros: bigint;
  platformMarginBps: number;
}): PremiumQuote {
  const { amount, refundBps, maxPremiumBps, askMicros, platformMarginBps } = params;
  const refund = refundFor(amount, refundBps);
  const maxPremium = maxPremiumFor(amount, maxPremiumBps);
  const premiumBps = premiumBpsFor(refundBps, askMicros, platformMarginBps);
  const raw = rawPremiumFor(amount, refundBps, askMicros, platformMarginBps);
  const withinCap = askMicros <= maxHedgePriceMicros(maxPremiumBps, refundBps, platformMarginBps);
  const premium = withinCap && raw > maxPremium ? maxPremium : raw;
  return { premium, premiumBps, refund, maxPremium, withinCap: withinCap && premium <= maxPremium };
}

// ---------- formatting / parsing ----------

/** "$1.00", "$1.725" — never shows crypto units. Keeps sub-cent precision only when present. */
export function formatUsd(baseUnits: bigint | number | string): string {
  const v = BigInt(baseUnits);
  const negative = v < 0n;
  const abs = negative ? -v : v;
  const whole = abs / USDC_UNIT;
  const frac = abs % USDC_UNIT;
  let fracStr = frac.toString().padStart(USDC_DECIMALS, '0');
  fracStr = fracStr.replace(/0+$/, '');
  if (fracStr.length < 2) fracStr = fracStr.padEnd(2, '0');
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}$${wholeStr}.${fracStr}`;
}

/** "4.50" | "$4.50" | 4.5 -> 4_500_000n. Rejects more than 6 decimals. */
export function parseUsd(input: string | number): bigint {
  const s = String(input).trim().replace(/^\$/, '').replace(/,/g, '');
  const m = /^(\d+)(?:\.(\d{0,6}))?$/.exec(s);
  if (!m) throw new Error(`Invalid dollar amount: ${input}`);
  const whole = BigInt(m[1]!);
  const frac = BigInt((m[2] ?? '').padEnd(USDC_DECIMALS, '0') || '0');
  return whole * USDC_UNIT + frac;
}

/** "0.27" | 0.27 -> 270_000n micros. */
export function priceToMicros(price: string | number): bigint {
  const s = String(price).trim();
  const m = /^(\d+)(?:\.(\d{0,6})\d*)?$/.exec(s);
  if (!m) throw new Error(`Invalid price: ${price}`);
  return BigInt(m[1]!) * PRICE_MICROS_PER_DOLLAR + BigInt((m[2] ?? '').padEnd(6, '0') || '0');
}

/** 270_000n -> "0.27" (trims trailing zeros, keeps 2 decimals minimum). */
export function microsToPrice(micros: bigint | number): string {
  const v = BigInt(micros);
  const whole = v / PRICE_MICROS_PER_DOLLAR;
  let frac = (v % PRICE_MICROS_PER_DOLLAR).toString().padStart(6, '0').replace(/0+$/, '');
  if (frac.length < 2) frac = frac.padEnd(2, '0');
  return `${whole}.${frac}`;
}

/** 2500 -> "25%", 1250 -> "12.5%". */
export function formatBps(bps: number): string {
  const pct = bps / 100;
  return `${Number.isInteger(pct) ? pct.toFixed(0) : pct.toFixed(2).replace(/0+$/, '')}%`;
}
