/** USDC (and our mock dUSDC) use 6 decimals: 1 USDC = 1_000_000 base units. */
export const USDC_DECIMALS = 6;
export const USDC_UNIT = 1_000_000n;

/** Claim tokens mirror USDC base units 1:1 (a claim balance == refund owed). */
export const CLAIM_DECIMALS = 6;

/** Each Gemini prediction-market contract pays $1 on YES == 1_000_000 USDC base units. */
export const CONTRACT_PAYOUT_BASE_UNITS = 1_000_000n;

/** Basis points denominator. */
export const BPS_DENOMINATOR = 10_000n;

/** Prices are carried internally as integer micro-dollars per contract (0.27 USD -> 270_000). */
export const PRICE_MICROS_PER_DOLLAR = 1_000_000n;

/** Max length of the Gemini market symbol stored on the Campaign account (bytes). */
export const MAX_MARKET_SYMBOL_LEN = 64;

/** PDA seeds — must match programs/on_the_house/src/constants.rs. */
export const SEEDS = {
  config: 'config',
  campaign: 'campaign',
  claimMint: 'claim_mint',
  refundVault: 'refund_vault',
} as const;

/** Genesis hashes used to refuse anything that is not devnet (or a local validator). */
export const GENESIS_HASH = {
  devnet: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
  testnet: '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY',
  mainnet: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
} as const;

/** Circle's official devnet USDC mint (can be swapped in for our mock dUSDC via USDC_MINT). */
export const CIRCLE_DEVNET_USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

/** The only Gemini host we may ever trade against. */
export const GEMINI_SANDBOX_HOST = 'api.sandbox.gemini.com';
export const GEMINI_PRODUCTION_HOST = 'api.gemini.com';
