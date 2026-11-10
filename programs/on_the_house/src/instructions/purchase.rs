use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{
        mint_to, transfer_checked, Mint, MintTo, Token2022, TokenAccount, TokenInterface, TransferChecked,
    },
};

use super::bps_of;
use crate::{
    constants::{CAMPAIGN_SEED, CONFIG_SEED},
    errors::OthError,
    events::PurchaseEvent,
    state::{Campaign, CampaignStatus, Config},
};

#[derive(Accounts)]
pub struct Purchase<'info> {
    /// Fee payer and rent payer (customers need zero SOL). Its signature also authorizes the premium.
    #[account(mut)]
    pub operator: Signer<'info>,

    pub customer: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = operator @ OthError::Unauthorized,
        has_one = treasury @ OthError::InvalidTreasury,
        has_one = usdc_mint @ OthError::InvalidUsdcMint,
    )]
    pub config: Box<Account<'info, Config>>,

    #[account(
        mut,
        has_one = merchant_usdc @ OthError::InvalidMerchantAccount,
        has_one = claim_mint,
    )]
    pub campaign: Box<Account<'info, Campaign>>,

    #[account(mint::token_program = usdc_token_program)]
    pub usdc_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = customer,
        token::token_program = usdc_token_program,
    )]
    pub customer_usdc: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut)]
    pub merchant_usdc: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut)]
    pub treasury: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut, mint::token_program = claim_token_program)]
    pub claim_mint: Box<InterfaceAccount<'info, Mint>>,

    /// The customer's (non-transferable) claim account, created on first purchase at the operator's expense.
    #[account(
        init_if_needed,
        payer = operator,
        associated_token::mint = claim_mint,
        associated_token::authority = customer,
        associated_token::token_program = claim_token_program,
    )]
    pub customer_claim: Box<InterfaceAccount<'info, TokenAccount>>,

    pub usdc_token_program: Interface<'info, TokenInterface>,
    pub claim_token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Purchase>, amount: u64, premium: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let c = &ctx.accounts.campaign;

    require!(c.status == CampaignStatus::Open, OthError::CampaignNotOpen);
    require!(now <= c.sales_deadline, OthError::SalesClosed);
    require!(amount > 0, OthError::InvalidAmount);

    // The merchant's cost cap: premium ≤ amount × max_premium_bps / 10_000.
    let max_premium = bps_of(amount, c.max_premium_bps)?;
    require!(premium <= max_premium, OthError::PremiumTooHigh);

    let refund = bps_of(amount, c.refund_bps)?;
    require!(refund > 0, OthError::RefundTooSmall);

    let liability_after = c.liability.checked_add(refund).ok_or(OthError::MathOverflow)?;
    require!(liability_after <= c.liability_cap, OthError::LiabilityCapExceeded);
    // The on-chain guarantee that the shop is never exposed beyond max_unhedged.
    require!(c.unhedged_after(liability_after) <= c.max_unhedged, OthError::UnhedgedLimitExceeded);

    let decimals = ctx.accounts.usdc_mint.decimals;
    let usdc_program = ctx.accounts.usdc_token_program.key();

    // 1. amount − premium to the merchant, premium to the treasury (customer signs).
    let to_merchant = amount - premium; // premium ≤ max_premium ≤ amount
    if to_merchant > 0 {
        transfer_checked(
            CpiContext::new(
                usdc_program,
                TransferChecked {
                    from: ctx.accounts.customer_usdc.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                    to: ctx.accounts.merchant_usdc.to_account_info(),
                    authority: ctx.accounts.customer.to_account_info(),
                },
            ),
            to_merchant,
            decimals,
        )?;
    }
    if premium > 0 {
        transfer_checked(
            CpiContext::new(
                usdc_program,
                TransferChecked {
                    from: ctx.accounts.customer_usdc.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                    authority: ctx.accounts.customer.to_account_info(),
                },
            ),
            premium,
            decimals,
        )?;
    }

    // 2. Mint `refund` claim tokens to the customer (campaign PDA is the mint authority).
    let merchant = c.merchant;
    let id_le = c.campaign_id.to_le_bytes();
    let bump = [c.bump];
    let seeds: &[&[u8]] = &[CAMPAIGN_SEED, merchant.as_ref(), &id_le, &bump];
    mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.claim_token_program.key(),
            MintTo {
                mint: ctx.accounts.claim_mint.to_account_info(),
                to: ctx.accounts.customer_claim.to_account_info(),
                authority: ctx.accounts.campaign.to_account_info(),
            },
            &[seeds],
        ),
        refund,
    )?;

    // 3. Book it.
    let campaign_key = ctx.accounts.campaign.key();
    let buyer = ctx.accounts.customer.key();
    let campaign = &mut ctx.accounts.campaign;
    campaign.liability = liability_after;
    campaign.total_sales = campaign.total_sales.checked_add(amount).ok_or(OthError::MathOverflow)?;
    campaign.total_premium = campaign.total_premium.checked_add(premium).ok_or(OthError::MathOverflow)?;
    campaign.purchase_count = campaign.purchase_count.saturating_add(1);

    emit!(PurchaseEvent {
        campaign: campaign_key,
        buyer,
        amount,
        premium,
        refund,
        liability_after,
        hedged_contracts: campaign.hedged_contracts,
    });
    Ok(())
}
