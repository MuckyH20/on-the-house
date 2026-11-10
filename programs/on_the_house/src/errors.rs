use anchor_lang::prelude::*;

#[error_code]
pub enum OthError {
    #[msg("Signer is not allowed to perform this action")]
    Unauthorized,
    #[msg("The campaign currency must have 6 decimals")]
    InvalidUsdcMint,
    #[msg("Treasury must be a token account for the configured USDC mint")]
    InvalidTreasury,
    #[msg("Merchant payout account must hold the configured USDC mint")]
    InvalidMerchantAccount,
    #[msg("Refund must be between 1 and 10000 bps")]
    InvalidRefundBps,
    #[msg("Max cost per sale must be at most 10000 bps")]
    InvalidMaxPremiumBps,
    #[msg("Market symbol must be 1 to 64 bytes")]
    InvalidMarketSymbol,
    #[msg("Sales deadline must be in the future")]
    InvalidDeadline,
    #[msg("Liability cap must be positive")]
    InvalidLiabilityCap,
    #[msg("max_unhedged cannot exceed the liability cap")]
    InvalidMaxUnhedged,
    #[msg("Campaign is not open for sales")]
    CampaignNotOpen,
    #[msg("The sales window for this promo has closed")]
    SalesClosed,
    #[msg("Amount must be positive")]
    InvalidAmount,
    #[msg("Premium exceeds the merchant's maximum cost per sale")]
    PremiumTooHigh,
    #[msg("Refund rounds to zero for this amount")]
    RefundTooSmall,
    #[msg("This sale would exceed the campaign's liability cap")]
    LiabilityCapExceeded,
    #[msg("This sale would leave more refunds unhedged than max_unhedged allows")]
    UnhedgedLimitExceeded,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("contracts_added must be positive")]
    InvalidContracts,
    #[msg("Campaign is already settled or cancelled")]
    CampaignClosed,
    #[msg("Outcome must be Yes or No")]
    InvalidOutcome,
    #[msg("Campaign has not settled")]
    NotSettled,
    #[msg("Campaign did not settle Yes; claims pay nothing")]
    OutcomeNotYes,
    #[msg("Claims can only be closed after a No outcome or a cancellation")]
    ClaimsNotClosable,
    #[msg("This wallet holds no claims for the campaign")]
    NothingToPay,
    #[msg("A campaign with sales cannot be cancelled; settle it instead")]
    CampaignHasSales,
}
