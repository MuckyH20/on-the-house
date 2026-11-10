use anchor_lang::prelude::*;

use crate::{
    constants::CONFIG_SEED,
    errors::OthError,
    events::CampaignSettled,
    state::{Campaign, CampaignStatus, Config, Outcome},
};

#[derive(Accounts)]
pub struct Settle<'info> {
    pub operator: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = operator @ OthError::Unauthorized)]
    pub config: Account<'info, Config>,

    #[account(mut)]
    pub campaign: Account<'info, Campaign>,
}

/// Called by the operator once the prediction market resolves. Ends sales for good.
pub fn handler(ctx: Context<Settle>, outcome: Outcome) -> Result<()> {
    require!(outcome != Outcome::None, OthError::InvalidOutcome);
    let campaign_key = ctx.accounts.campaign.key();
    let campaign = &mut ctx.accounts.campaign;
    require!(campaign.is_live(), OthError::CampaignClosed);

    campaign.status = CampaignStatus::Settled;
    campaign.outcome = outcome;
    campaign.settled_at = Clock::get()?.unix_timestamp;

    emit!(CampaignSettled {
        campaign: campaign_key,
        outcome,
        liability: campaign.liability,
        hedged_contracts: campaign.hedged_contracts,
    });
    Ok(())
}
