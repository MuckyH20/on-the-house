use anchor_lang::prelude::*;
use anchor_spl::token_interface::{burn_checked, BurnChecked, Mint, Token2022, TokenAccount};

use crate::{
    constants::{CAMPAIGN_SEED, CLAIM_DECIMALS},
    errors::OthError,
    events::ClaimsClosed,
    state::{Campaign, CampaignStatus, Outcome},
};

#[derive(Accounts)]
pub struct CloseClaims<'info> {
    /// CHECK: The claim holder; only used to derive and validate its claim token account.
    pub customer: UncheckedAccount<'info>,

    #[account(has_one = claim_mint)]
    pub campaign: Box<Account<'info, Campaign>>,

    #[account(mut, mint::token_program = claim_token_program)]
    pub claim_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        associated_token::mint = claim_mint,
        associated_token::authority = customer,
        associated_token::token_program = claim_token_program,
    )]
    pub customer_claim: Box<InterfaceAccount<'info, TokenAccount>>,

    pub claim_token_program: Program<'info, Token2022>,
}

/// After a No outcome (or a cancellation) claims are worthless; anyone may burn them for tidiness.
pub fn handler(ctx: Context<CloseClaims>) -> Result<()> {
    let c = &ctx.accounts.campaign;
    let closable = (c.status == CampaignStatus::Settled && c.outcome == Outcome::No)
        || c.status == CampaignStatus::Cancelled;
    require!(closable, OthError::ClaimsNotClosable);

    let amount = ctx.accounts.customer_claim.amount;
    require!(amount > 0, OthError::NothingToPay);

    let merchant = c.merchant;
    let id_le = c.campaign_id.to_le_bytes();
    let bump = [c.bump];
    let seeds: &[&[u8]] = &[CAMPAIGN_SEED, merchant.as_ref(), &id_le, &bump];
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

    emit!(ClaimsClosed {
        campaign: ctx.accounts.campaign.key(),
        customer: ctx.accounts.customer.key(),
        amount,
    });
    Ok(())
}
