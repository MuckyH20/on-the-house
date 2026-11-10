use anchor_lang::{
    prelude::*,
    system_program::{create_account, CreateAccount},
};
use anchor_spl::{
    token_2022::spl_token_2022::extension::ExtensionType,
    token_2022_extensions::{
        non_transferable_mint_initialize, permanent_delegate_initialize, NonTransferableMintInitialize,
        PermanentDelegateInitialize,
    },
    token_interface::{
        find_mint_account_size, initialize_mint2, InitializeMint2, Mint, Token2022, TokenAccount, TokenInterface,
    },
};

use crate::{
    constants::{
        BPS_DENOMINATOR, CAMPAIGN_SEED, CLAIM_DECIMALS, CLAIM_MINT_SEED, CONFIG_SEED, MAX_MARKET_SYMBOL_LEN,
        REFUND_VAULT_SEED,
    },
    errors::OthError,
    events::CampaignCreated,
    state::{Campaign, CampaignStatus, Config, Outcome},
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct CreateCampaignParams {
    /// Merchant-chosen id; the campaign PDA is seeded by (merchant, campaign_id).
    pub campaign_id: u64,
    /// Gemini prediction-market symbol (max 64 bytes).
    pub market_symbol: String,
    /// Refund on YES, in bps of the sale (10_000 = everything free).
    pub refund_bps: u16,
    /// Merchant's maximum cost per sale, in bps of the sale.
    pub max_premium_bps: u16,
    /// Maximum total refunds (USDC base units).
    pub liability_cap: u64,
    /// Maximum refunds promised but not yet hedged (USDC base units).
    pub max_unhedged: u64,
    /// Unix timestamp after which sales are rejected.
    pub sales_deadline: i64,
}

#[derive(Accounts)]
#[instruction(params: CreateCampaignParams)]
pub struct CreateCampaign<'info> {
    /// Pays rent for the campaign, claim mint and refund vault (the operator in the demo).
    #[account(mut)]
    pub payer: Signer<'info>,

    pub merchant: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    #[account(
        init,
        payer = payer,
        space = Campaign::DISCRIMINATOR.len() + Campaign::INIT_SPACE,
        seeds = [CAMPAIGN_SEED, merchant.key().as_ref(), params.campaign_id.to_le_bytes().as_ref()],
        bump
    )]
    pub campaign: Box<Account<'info, Campaign>>,

    #[account(address = config.usdc_mint, mint::token_program = usdc_token_program)]
    pub usdc_mint: Box<InterfaceAccount<'info, Mint>>,

    /// Receives the merchant's share of every sale.
    #[account(
        token::mint = usdc_mint,
        token::token_program = usdc_token_program,
    )]
    pub merchant_usdc: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: Created and initialized in the handler as a Token-2022 mint with the NonTransferable
    /// and PermanentDelegate extensions (Anchor's `init` constraints cannot add NonTransferable).
    /// The seeds constraint pins the address.
    #[account(mut, seeds = [CLAIM_MINT_SEED, campaign.key().as_ref()], bump)]
    pub claim_mint: UncheckedAccount<'info>,

    /// Holds the USDC that pays refunds; the campaign PDA is its authority.
    #[account(
        init,
        payer = payer,
        seeds = [REFUND_VAULT_SEED, campaign.key().as_ref()],
        bump,
        token::mint = usdc_mint,
        token::authority = campaign,
        token::token_program = usdc_token_program,
    )]
    pub refund_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    pub usdc_token_program: Interface<'info, TokenInterface>,
    pub claim_token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CreateCampaign>, params: CreateCampaignParams) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let symbol_len = params.market_symbol.len();
    require!(symbol_len > 0 && symbol_len <= MAX_MARKET_SYMBOL_LEN, OthError::InvalidMarketSymbol);
    require!(
        params.refund_bps > 0 && u64::from(params.refund_bps) <= BPS_DENOMINATOR,
        OthError::InvalidRefundBps
    );
    require!(u64::from(params.max_premium_bps) <= BPS_DENOMINATOR, OthError::InvalidMaxPremiumBps);
    require!(params.sales_deadline > now, OthError::InvalidDeadline);
    require!(params.liability_cap > 0, OthError::InvalidLiabilityCap);
    require!(params.max_unhedged <= params.liability_cap, OthError::InvalidMaxUnhedged);

    let campaign_key = ctx.accounts.campaign.key();
    let token_program_id = ctx.accounts.claim_token_program.key();

    // 1. Allocate the claim mint (PDA) with room for both extensions, owned by Token-2022.
    let extensions = vec![ExtensionType::NonTransferable, ExtensionType::PermanentDelegate];
    let space = find_mint_account_size(Some(&extensions))?;
    let lamports = Rent::get()?.minimum_balance(space);
    let claim_mint_bump = [ctx.bumps.claim_mint];
    let claim_mint_seeds: &[&[u8]] = &[CLAIM_MINT_SEED, campaign_key.as_ref(), &claim_mint_bump];
    create_account(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.key(),
            CreateAccount {
                from: ctx.accounts.payer.to_account_info(),
                to: ctx.accounts.claim_mint.to_account_info(),
            },
            &[claim_mint_seeds],
        ),
        lamports,
        space as u64,
        &token_program_id,
    )?;

    // 2. Extensions must be initialized before the mint itself.
    non_transferable_mint_initialize(CpiContext::new(
        token_program_id,
        NonTransferableMintInitialize {
            token_program_id: ctx.accounts.claim_token_program.to_account_info(),
            mint: ctx.accounts.claim_mint.to_account_info(),
        },
    ))?;
    permanent_delegate_initialize(
        CpiContext::new(
            token_program_id,
            PermanentDelegateInitialize {
                token_program_id: ctx.accounts.claim_token_program.to_account_info(),
                mint: ctx.accounts.claim_mint.to_account_info(),
            },
        ),
        &campaign_key,
    )?;

    // 3. Mint authority = campaign PDA, no freeze authority.
    initialize_mint2(
        CpiContext::new(token_program_id, InitializeMint2 { mint: ctx.accounts.claim_mint.to_account_info() }),
        CLAIM_DECIMALS,
        &campaign_key,
        None,
    )?;

    let merchant_usdc = ctx.accounts.merchant_usdc.key();
    let claim_mint = ctx.accounts.claim_mint.key();
    let refund_vault = ctx.accounts.refund_vault.key();
    let campaign = &mut ctx.accounts.campaign;
    campaign.merchant = ctx.accounts.merchant.key();
    campaign.merchant_usdc = merchant_usdc;
    campaign.campaign_id = params.campaign_id;
    campaign.market_symbol = params.market_symbol.clone();
    campaign.refund_bps = params.refund_bps;
    campaign.max_premium_bps = params.max_premium_bps;
    campaign.liability_cap = params.liability_cap;
    campaign.max_unhedged = params.max_unhedged;
    campaign.sales_deadline = params.sales_deadline;
    campaign.status = CampaignStatus::Open;
    campaign.outcome = Outcome::None;
    campaign.liability = 0;
    campaign.hedged_contracts = 0;
    campaign.claim_mint = claim_mint;
    campaign.refund_vault = refund_vault;
    campaign.total_sales = 0;
    campaign.total_premium = 0;
    campaign.total_paid_out = 0;
    campaign.purchase_count = 0;
    campaign.created_at = now;
    campaign.settled_at = 0;
    campaign.bump = ctx.bumps.campaign;
    campaign.claim_mint_bump = ctx.bumps.claim_mint;
    campaign.refund_vault_bump = ctx.bumps.refund_vault;

    emit!(CampaignCreated {
        campaign: campaign_key,
        merchant: campaign.merchant,
        campaign_id: params.campaign_id,
        market_symbol: params.market_symbol,
        refund_bps: params.refund_bps,
        max_premium_bps: params.max_premium_bps,
        liability_cap: params.liability_cap,
        max_unhedged: params.max_unhedged,
        sales_deadline: params.sales_deadline,
        merchant_usdc,
        claim_mint,
        refund_vault,
    });
    Ok(())
}
