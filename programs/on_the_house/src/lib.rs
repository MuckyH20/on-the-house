//! On the House — event-contingent shop promotions with a fixed, known cost.
//!
//! A merchant runs a promo such as "if BTC is above $X at 3 PM, everything you buy in the next hour
//! is free". Every sale is recorded here and mints the customer a non-transferable claim token worth
//! the refund. An off-chain operator hedges the promised refunds on a prediction market, records each
//! hedge on-chain (proof of hedge), and settles the campaign when the market resolves. On YES, anyone
//! can crank `payout`, which burns a customer's claims and pays the same amount of USDC.
//!
//! Trust assumption: the operator funds the refund vault (from the prediction-market payout in
//! production; with mock dUSDC in the demo) and reports the outcome. The program enforces the
//! merchant's cost cap, liability cap and maximum unhedged exposure on every sale.

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;
use state::Outcome;

declare_id!("4qfLMXZTmKt71eDH4S3VNSDCRFPX7qxpPk3WZZgt2PM2");

#[program]
pub mod on_the_house {
    use super::*;

    /// One-time setup. Only the program's upgrade authority may call it.
    pub fn initialize_config(ctx: Context<InitializeConfig>, operator: Pubkey) -> Result<()> {
        instructions::initialize_config::handler(ctx, operator)
    }

    /// Admin only: rotate the operator and/or treasury.
    pub fn update_config(ctx: Context<UpdateConfig>, operator: Pubkey) -> Result<()> {
        instructions::update_config::handler(ctx, operator)
    }

    /// Signed by the merchant. Creates the campaign, its claim mint and its refund vault.
    pub fn create_campaign(ctx: Context<CreateCampaign>, params: CreateCampaignParams) -> Result<()> {
        instructions::create_campaign::handler(ctx, params)
    }

    /// Signed by the customer and the operator (fee payer, price authority).
    pub fn purchase(ctx: Context<Purchase>, amount: u64, premium: u64) -> Result<()> {
        instructions::purchase::handler(ctx, amount, premium)
    }

    /// Operator only: record contracts bought on the prediction market (proof of hedge).
    pub fn record_hedge(
        ctx: Context<RecordHedge>,
        contracts_added: u64,
        avg_price_micros: u64,
        order_ref_hash: [u8; 32],
    ) -> Result<()> {
        instructions::record_hedge::handler(ctx, contracts_added, avg_price_micros, order_ref_hash)
    }

    /// Merchant or operator: pause / resume sales.
    pub fn set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
        instructions::set_paused::handler(ctx, paused)
    }

    /// Operator only, after the market resolves.
    pub fn settle(ctx: Context<Settle>, outcome: Outcome) -> Result<()> {
        instructions::settle::handler(ctx, outcome)
    }

    /// Permissionless crank after a Yes outcome: burns the customer's claims, pays the same in USDC.
    pub fn payout(ctx: Context<Payout>) -> Result<()> {
        instructions::payout::handler(ctx)
    }

    /// Permissionless crank after a No outcome (or a cancellation): burns worthless claims.
    pub fn close_claims(ctx: Context<CloseClaims>) -> Result<()> {
        instructions::close_claims::handler(ctx)
    }

    /// Merchant or operator: cancel a campaign that has no sales.
    pub fn cancel_campaign(ctx: Context<CancelCampaign>) -> Result<()> {
        instructions::cancel_campaign::handler(ctx)
    }
}
