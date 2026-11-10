use anchor_lang::prelude::*;

use crate::{
    constants::CONFIG_SEED,
    errors::OthError,
    events::CampaignCancelled,
    state::{Campaign, CampaignStatus, Config},
};

#[derive(Accounts)]
pub struct CancelCampaign<'info> {
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

pub fn handler(ctx: Context<CancelCampaign>) -> Result<()> {
    let campaign_key = ctx.accounts.campaign.key();
    let campaign = &mut ctx.accounts.campaign;
    require!(campaign.is_live(), OthError::CampaignClosed);
    require!(campaign.liability == 0, OthError::CampaignHasSales);
    campaign.status = CampaignStatus::Cancelled;
    emit!(CampaignCancelled { campaign: campaign_key, by: ctx.accounts.authority.key() });
    Ok(())
}
