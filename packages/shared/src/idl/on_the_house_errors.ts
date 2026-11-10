
export const OnTheHouseErrorCode = {
  Unauthorized: 6000,
  InvalidUsdcMint: 6001,
  InvalidTreasury: 6002,
  InvalidMerchantAccount: 6003,
  InvalidRefundBps: 6004,
  InvalidMaxPremiumBps: 6005,
  InvalidMarketSymbol: 6006,
  InvalidDeadline: 6007,
  InvalidLiabilityCap: 6008,
  InvalidMaxUnhedged: 6009,
  CampaignNotOpen: 6010,
  SalesClosed: 6011,
  InvalidAmount: 6012,
  PremiumTooHigh: 6013,
  RefundTooSmall: 6014,
  LiabilityCapExceeded: 6015,
  UnhedgedLimitExceeded: 6016,
  MathOverflow: 6017,
  InvalidContracts: 6018,
  CampaignClosed: 6019,
  InvalidOutcome: 6020,
  NotSettled: 6021,
  OutcomeNotYes: 6022,
  ClaimsNotClosable: 6023,
  NothingToPay: 6024,
  CampaignHasSales: 6025
};

export type OnTheHouseErrorName = keyof typeof OnTheHouseErrorCode;
