use anchor_lang::prelude::*;

#[constant]
pub const CONFIG_SEED: &[u8] = b"config";
#[constant]
pub const CAMPAIGN_SEED: &[u8] = b"campaign";
#[constant]
pub const CLAIM_MINT_SEED: &[u8] = b"claim_mint";
#[constant]
pub const REFUND_VAULT_SEED: &[u8] = b"refund_vault";

/// Basis-points denominator (10_000 bps = 100%).
pub const BPS_DENOMINATOR: u64 = 10_000;

/// One prediction-market contract pays $1 on YES = 1_000_000 USDC base units.
#[constant]
pub const CONTRACT_UNIT: u64 = 1_000_000;

/// The campaign currency (USDC / mock dUSDC) must use 6 decimals so 1 contract == 1_000_000 base units.
pub const USDC_DECIMALS: u8 = 6;

/// Claim tokens use the same base units as USDC: a claim balance equals the refund owed.
pub const CLAIM_DECIMALS: u8 = 6;

/// Max bytes of the Gemini market symbol stored on a campaign.
pub const MAX_MARKET_SYMBOL_LEN: usize = 64;
