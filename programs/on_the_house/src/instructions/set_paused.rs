use anchor_lang::prelude::*;

use crate::{
    constants::CONFIG_SEED,
    errors::OthError,
    events::CampaignPauseChanged,
    state::{Campaign, CampaignStatus, Config},
};

#[derive(Accounts)]
pub struct SetPaused<'info> {
    /// The campaign's merchant or the operator.
    pub authority: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        constraint = authority.key() == campaign.merchant || authority.key() == config.operator
            @ OthError::Unauthorized,
    )]
    pub campaign: Account<'info, Campaign>,
}

pub fn handler(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
    let campaign_key = ctx.accounts.campaign.key();
    let campaign = &mut ctx.accounts.campaign;
    campaign.status = match (campaign.status, paused) {
        (CampaignStatus::Open, true) | (CampaignStatus::Paused, true) => CampaignStatus::Paused,
        (CampaignStatus::Paused, false) | (CampaignStatus::Open, false) => CampaignStatus::Open,
        _ => return err!(OthError::CampaignClosed),
    };
    emit!(CampaignPauseChanged { campaign: campaign_key, paused, by: ctx.accounts.authority.key() });
    Ok(())
}
