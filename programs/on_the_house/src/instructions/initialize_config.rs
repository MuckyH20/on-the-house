use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::{
    constants::{CONFIG_SEED, USDC_DECIMALS},
    errors::OthError,
    events::ConfigInitialized,
    program::OnTheHouse,
    state::Config,
};

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = Config::DISCRIMINATOR.len() + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,

    /// The campaign currency (USDC or the mock dUSDC).
    #[account(
        mint::token_program = usdc_token_program,
        constraint = usdc_mint.decimals == USDC_DECIMALS @ OthError::InvalidUsdcMint
    )]
    pub usdc_mint: InterfaceAccount<'info, Mint>,

    /// Platform treasury token account: receives every premium.
    #[account(token::mint = usdc_mint, token::token_program = usdc_token_program)]
    pub treasury: InterfaceAccount<'info, TokenAccount>,

    /// "Admin only": the signer must be this program's upgrade authority, so nobody can
    /// front-run the deployer and take over the config.
    #[account(constraint = program.programdata_address()? == Some(program_data.key()) @ OthError::Unauthorized)]
    pub program: Program<'info, OnTheHouse>,
    #[account(constraint = program_data.upgrade_authority_address == Some(admin.key()) @ OthError::Unauthorized)]
    pub program_data: Account<'info, ProgramData>,

    pub usdc_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeConfig>, operator: Pubkey) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.operator = operator;
    config.treasury = ctx.accounts.treasury.key();
    config.usdc_mint = ctx.accounts.usdc_mint.key();
    config.bump = ctx.bumps.config;

    emit!(ConfigInitialized {
        admin: config.admin,
        operator: config.operator,
        treasury: config.treasury,
        usdc_mint: config.usdc_mint,
    });
    Ok(())
}
