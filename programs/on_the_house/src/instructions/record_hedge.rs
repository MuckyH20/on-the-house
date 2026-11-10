use anchor_lang::prelude::*;

use crate::{
    constants::CONFIG_SEED,
    errors::OthError,
    events::HedgeRecorded,
    state::{Campaign, Config},
};

#[derive(Accounts)]
pub struct RecordHedge<'info> {
    pub operator: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = operator @ OthError::Unauthorized)]
    pub config: Account<'info, Config>,

    #[account(mut)]
    pub campaign: Account<'info, Campaign>,
}

/// Records `contracts_added` prediction-market contracts bought for this campaign.
/// `avg_price_micros` is the average fill price per $1 contract in micro-dollars;
/// `order_ref_hash` is sha256 of the venue's order id(s) so the fill can be audited off-chain.
pub fn handler(
    ctx: Context<RecordHedge>,
    contracts_added: u64,
    avg_price_micros: u64,
    order_ref_hash: [u8; 32],
) -> Result<()> {
    require!(contracts_added > 0, OthError::InvalidContracts);
    let campaign_key = ctx.accounts.campaign.key();
    let campaign = &mut ctx.accounts.campaign;
    require!(campaign.is_live(), OthError::CampaignClosed);

    campaign.hedged_contracts = campaign
        .hedged_contracts
        .checked_add(contracts_added)
        .ok_or(OthError::MathOverflow)?;

    emit!(HedgeRecorded {
        campaign: campaign_key,
        contracts_added,
        hedged_contracts: campaign.hedged_contracts,
        avg_price_micros,
        order_ref_hash,
        liability: campaign.liability,
    });
    Ok(())
}
