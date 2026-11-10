use anchor_lang::prelude::*;

use crate::state::Outcome;

// Events are emitted with `emit!` (program log "Program data: <base64>") so that a plain
// `onLogs(programId)` websocket subscription or a QuickNode Stream sees every one of them.

#[event]
pub struct ConfigInitialized {
    pub admin: Pubkey,
    pub operator: Pubkey,
    pub treasury: Pubkey,
    pub usdc_mint: Pubkey,
}

#[event]
pub struct ConfigUpdated {
    pub operator: Pubkey,
    pub treasury: Pubkey,
}

#[event]
pub struct CampaignCreated {
    pub campaign: Pubkey,
    pub merchant: Pubkey,
    pub campaign_id: u64,
    pub market_symbol: String,
    pub refund_bps: u16,
    pub max_premium_bps: u16,
    pub liability_cap: u64,
    pub max_unhedged: u64,
    pub sales_deadline: i64,
    pub merchant_usdc: Pubkey,
    pub claim_mint: Pubkey,
    pub refund_vault: Pubkey,
}

#[event]
pub struct PurchaseEvent {
    pub campaign: Pubkey,
    pub buyer: Pubkey,
    pub amount: u64,
    pub premium: u64,
    pub refund: u64,
    pub liability_after: u64,
    pub hedged_contracts: u64,
}

/// The on-chain proof-of-hedge record.
#[event]
pub struct HedgeRecorded {
    pub campaign: Pubkey,
    pub contracts_added: u64,
    pub hedged_contracts: u64,
    pub avg_price_micros: u64,
    pub order_ref_hash: [u8; 32],
    pub liability: u64,
}

#[event]
pub struct CampaignPauseChanged {
    pub campaign: Pubkey,
    pub paused: bool,
    pub by: Pubkey,
}

#[event]
pub struct CampaignSettled {
    pub campaign: Pubkey,
    pub outcome: Outcome,
    pub liability: u64,
    pub hedged_contracts: u64,
}

#[event]
pub struct PayoutEvent {
    pub campaign: Pubkey,
    pub customer: Pubkey,
    pub amount: u64,
    pub total_paid_out: u64,
}

#[event]
pub struct ClaimsClosed {
    pub campaign: Pubkey,
    pub customer: Pubkey,
    pub amount: u64,
}

#[event]
pub struct CampaignCancelled {
    pub campaign: Pubkey,
    pub by: Pubkey,
}
