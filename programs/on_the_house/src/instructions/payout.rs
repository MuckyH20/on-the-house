use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{
        burn_checked, transfer_checked, BurnChecked, Mint, Token2022, TokenAccount, TokenInterface, TransferChecked,
    },
};

use crate::{
    constants::{CAMPAIGN_SEED, CLAIM_DECIMALS, CONFIG_SEED},
    errors::OthError,
    events::PayoutEvent,
    state::{Campaign, CampaignStatus, Config, Outcome},
};

#[derive(Accounts)]
pub struct Payout<'info> {
    /// Anyone may crank. Pays rent only if the customer's USDC account has to be (re)created.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: The claim holder. Only used as the owner of the token accounts below, which are
    /// validated as this wallet's associated token accounts.
    pub customer: UncheckedAccount<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = usdc_mint @ OthError::InvalidUsdcMint)]
    pub config: Box<Account<'info, Config>>,

    #[account(mut, has_one = claim_mint, has_one = refund_vault)]
    pub campaign: Box<Account<'info, Campaign>>,

    #[account(mint::token_program = usdc_token_program)]
    pub usdc_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(mut, mint::token_program = claim_token_program)]
    pub claim_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        associated_token::mint = claim_mint,
        associated_token::authority = customer,
        associated_token::token_program = claim_token_program,
    )]
    pub customer_claim: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut)]
    pub refund_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = usdc_mint,
        associated_token::authority = customer,
        associated_token::token_program = usdc_token_program,
    )]
    pub customer_usdc: Box<InterfaceAccount<'info, TokenAccount>>,

    pub usdc_token_program: Interface<'info, TokenInterface>,
    pub claim_token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Payout>) -> Result<()> {
    let c = &ctx.accounts.campaign;
    require!(c.status == CampaignStatus::Settled, OthError::NotSettled);
    require!(c.outcome == Outcome::Yes, OthError::OutcomeNotYes);

    let amount = ctx.accounts.customer_claim.amount;
    require!(amount > 0, OthError::NothingToPay);

    let merchant = c.merchant;
    let id_le = c.campaign_id.to_le_bytes();
    let bump = [c.bump];
    let seeds: &[&[u8]] = &[CAMPAIGN_SEED, merchant.as_ref(), &id_le, &bump];

    // 1. Burn the customer's entire claim balance via the permanent delegate (the campaign PDA).
    burn_checked(
        CpiContext::new_with_signer(
            ctx.accounts.claim_token_program.key(),
            BurnChecked {
                mint: ctx.accounts.claim_mint.to_account_info(),
                from: ctx.accounts.customer_claim.to_account_info(),
                authority: ctx.accounts.campaign.to_account_info(),
            },
            &[seeds],
        ),
        amount,
        CLAIM_DECIMALS,
    )?;

    // 2. Pay exactly the same amount of USDC from the refund vault. Fails atomically if underfunded.
    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.usdc_token_program.key(),
            TransferChecked {
                from: ctx.accounts.refund_vault.to_account_info(),
                mint: ctx.accounts.usdc_mint.to_account_info(),
                to: ctx.accounts.customer_usdc.to_account_info(),
                authority: ctx.accounts.campaign.to_account_info(),
            },
            &[seeds],
        ),
        amount,
        ctx.accounts.usdc_mint.decimals,
    )?;

    let campaign_key = ctx.accounts.campaign.key();
    let customer = ctx.accounts.customer.key();
    let campaign = &mut ctx.accounts.campaign;
    campaign.total_paid_out = campaign.total_paid_out.checked_add(amount).ok_or(OthError::MathOverflow)?;

    emit!(PayoutEvent { campaign: campaign_key, customer, amount, total_paid_out: campaign.total_paid_out });
    Ok(())
}
