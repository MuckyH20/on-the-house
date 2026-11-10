use anchor_lang::prelude::*;

use crate::constants::{CONTRACT_UNIT, MAX_MARKET_SYMBOL_LEN};

/// Global settings. One per program (PDA seeded by `config`).
#[account]
#[derive(InitSpace)]
pub struct Config {
    /// The program's upgrade authority at initialization; may rotate the operator / treasury.
    pub admin: Pubkey,
    /// Prices sales (co-signs every purchase), records hedges, settles campaigns.
    pub operator: Pubkey,
    /// Token account that receives every premium.
    pub treasury: Pubkey,
    /// Campaign currency (USDC or the mock dUSDC); equals `treasury.mint`.
    pub usdc_mint: Pubkey,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum CampaignStatus {
    Open,
    Paused,
    Settled,
    Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum Outcome {
    None,
    Yes,
    No,
}

/// One promotion. PDA seeded by (`campaign`, merchant, campaign_id as u64 LE).
#[account]
#[derive(InitSpace)]
pub struct Campaign {
    pub merchant: Pubkey,
    /// Where the merchant's share of each sale goes.
    pub merchant_usdc: Pubkey,
    pub campaign_id: u64,
    /// Gemini prediction-market symbol whose YES outcome triggers refunds.
    #[max_len(MAX_MARKET_SYMBOL_LEN)]
    pub market_symbol: String,
    /// Refund owed on YES, as bps of the sale amount.
    pub refund_bps: u16,
    /// The merchant's maximum cost per sale (premium), as bps of the sale amount.
    pub max_premium_bps: u16,
    /// Maximum total refunds that may ever be promised (USDC base units).
    pub liability_cap: u64,
    /// Maximum refunds promised but not yet covered by hedged contracts (USDC base units).
    pub max_unhedged: u64,
    /// Unix timestamp after which purchases are rejected.
    pub sales_deadline: i64,
    pub status: CampaignStatus,
    pub outcome: Outcome,
    /// Total refunds promised (USDC base units) == claim mint supply before payouts.
    pub liability: u64,
    /// Contracts bought on the prediction market; each covers CONTRACT_UNIT of liability.
    pub hedged_contracts: u64,
    pub claim_mint: Pubkey,
    pub refund_vault: Pubkey,
    pub total_sales: u64,
    pub total_premium: u64,
    pub total_paid_out: u64,
    pub purchase_count: u32,
    pub created_at: i64,
    pub settled_at: i64,
    pub bump: u8,
    pub claim_mint_bump: u8,
    pub refund_vault_bump: u8,
}

impl Campaign {
    /// Refunds promised but not covered by hedges (saturating), as enforced in `purchase`.
    pub fn unhedged_after(&self, liability: u64) -> u64 {
        liability.saturating_sub(self.hedged_contracts.saturating_mul(CONTRACT_UNIT))
    }

    pub fn is_live(&self) -> bool {
        matches!(self.status, CampaignStatus::Open | CampaignStatus::Paused)
    }
}
