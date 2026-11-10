use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

use crate::{constants::CONFIG_SEED, errors::OthError, events::ConfigUpdated, state::Config};

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub admin: Signer<'info>,

    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ OthError::Unauthorized)]
    pub config: Account<'info, Config>,

    #[account(constraint = treasury.mint == config.usdc_mint @ OthError::InvalidTreasury)]
    pub treasury: InterfaceAccount<'info, TokenAccount>,
}

pub fn handler(ctx: Context<UpdateConfig>, operator: Pubkey) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.operator = operator;
    config.treasury = ctx.accounts.treasury.key();
    emit!(ConfigUpdated { operator, treasury: config.treasury });
    Ok(())
}
