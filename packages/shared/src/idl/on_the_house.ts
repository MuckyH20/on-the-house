/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/on_the_house.json`.
 */
export type OnTheHouse = {
  "address": "4qfLMXZTmKt71eDH4S3VNSDCRFPX7qxpPk3WZZgt2PM2",
  "metadata": {
    "name": "onTheHouse",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "On the House: event-contingent shop promos with non-transferable refund claims, hedged on prediction markets"
  },
  "instructions": [
    {
      "name": "cancelCampaign",
      "docs": [
        "Merchant or operator: cancel a campaign that has no sales."
      ],
      "discriminator": [
        66,
        10,
        32,
        138,
        122,
        36,
        134,
        202
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "The campaign's merchant or the operator."
          ],
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "campaign",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "closeClaims",
      "docs": [
        "Permissionless crank after a No outcome (or a cancellation): burns worthless claims."
      ],
      "discriminator": [
        118,
        193,
        228,
        27,
        108,
        156,
        187,
        106
      ],
      "accounts": [
        {
          "name": "customer"
        },
        {
          "name": "campaign"
        },
        {
          "name": "claimMint",
          "writable": true,
          "relations": [
            "campaign"
          ]
        },
        {
          "name": "customerClaim",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "customer"
              },
              {
                "kind": "account",
                "path": "claimTokenProgram"
              },
              {
                "kind": "account",
                "path": "claimMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "claimTokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        }
      ],
      "args": []
    },
    {
      "name": "createCampaign",
      "docs": [
        "Signed by the merchant. Creates the campaign, its claim mint and its refund vault."
      ],
      "discriminator": [
        111,
        131,
        187,
        98,
        160,
        193,
        114,
        244
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Pays rent for the campaign, claim mint and refund vault (the operator in the demo)."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "merchant",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "campaign",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  97,
                  109,
                  112,
                  97,
                  105,
                  103,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "merchant"
              },
              {
                "kind": "arg",
                "path": "params.campaignId"
              }
            ]
          }
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "merchantUsdc",
          "docs": [
            "Receives the merchant's share of every sale."
          ]
        },
        {
          "name": "claimMint",
          "docs": [
            "and PermanentDelegate extensions (Anchor's `init` constraints cannot add NonTransferable).",
            "The seeds constraint pins the address."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  108,
                  97,
                  105,
                  109,
                  95,
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "campaign"
              }
            ]
          }
        },
        {
          "name": "refundVault",
          "docs": [
            "Holds the USDC that pays refunds; the campaign PDA is its authority."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  102,
                  117,
                  110,
                  100,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "campaign"
              }
            ]
          }
        },
        {
          "name": "usdcTokenProgram"
        },
        {
          "name": "claimTokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "createCampaignParams"
            }
          }
        }
      ]
    },
    {
      "name": "initializeConfig",
      "docs": [
        "One-time setup. Only the program's upgrade authority may call it."
      ],
      "discriminator": [
        208,
        127,
        21,
        1,
        194,
        190,
        196,
        70
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "usdcMint",
          "docs": [
            "The campaign currency (USDC or the mock dUSDC)."
          ]
        },
        {
          "name": "treasury",
          "docs": [
            "Platform treasury token account: receives every premium."
          ]
        },
        {
          "name": "program",
          "docs": [
            "\"Admin only\": the signer must be this program's upgrade authority, so nobody can",
            "front-run the deployer and take over the config."
          ],
          "address": "4qfLMXZTmKt71eDH4S3VNSDCRFPX7qxpPk3WZZgt2PM2"
        },
        {
          "name": "programData"
        },
        {
          "name": "usdcTokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "operator",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "payout",
      "docs": [
        "Permissionless crank after a Yes outcome: burns the customer's claims, pays the same in USDC."
      ],
      "discriminator": [
        149,
        140,
        194,
        236,
        174,
        189,
        6,
        239
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Anyone may crank. Pays rent only if the customer's USDC account has to be (re)created."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "customer",
          "docs": [
            "validated as this wallet's associated token accounts."
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "campaign",
          "writable": true
        },
        {
          "name": "usdcMint",
          "relations": [
            "config"
          ]
        },
        {
          "name": "claimMint",
          "writable": true,
          "relations": [
            "campaign"
          ]
        },
        {
          "name": "customerClaim",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "customer"
              },
              {
                "kind": "account",
                "path": "claimTokenProgram"
              },
              {
                "kind": "account",
                "path": "claimMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "refundVault",
          "writable": true,
          "relations": [
            "campaign"
          ]
        },
        {
          "name": "customerUsdc",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "customer"
              },
              {
                "kind": "account",
                "path": "usdcTokenProgram"
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "usdcTokenProgram"
        },
        {
          "name": "claimTokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "purchase",
      "docs": [
        "Signed by the customer and the operator (fee payer, price authority)."
      ],
      "discriminator": [
        21,
        93,
        113,
        154,
        193,
        160,
        242,
        168
      ],
      "accounts": [
        {
          "name": "operator",
          "docs": [
            "Fee payer and rent payer (customers need zero SOL). Its signature also authorizes the premium."
          ],
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "customer",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "campaign",
          "writable": true
        },
        {
          "name": "usdcMint",
          "relations": [
            "config"
          ]
        },
        {
          "name": "customerUsdc",
          "writable": true
        },
        {
          "name": "merchantUsdc",
          "writable": true,
          "relations": [
            "campaign"
          ]
        },
        {
          "name": "treasury",
          "writable": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "claimMint",
          "writable": true,
          "relations": [
            "campaign"
          ]
        },
        {
          "name": "customerClaim",
          "docs": [
            "The customer's (non-transferable) claim account, created on first purchase at the operator's expense."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "customer"
              },
              {
                "kind": "account",
                "path": "claimTokenProgram"
              },
              {
                "kind": "account",
                "path": "claimMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "usdcTokenProgram"
        },
        {
          "name": "claimTokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "premium",
          "type": "u64"
        }
      ]
    },
    {
      "name": "recordHedge",
      "docs": [
        "Operator only: record contracts bought on the prediction market (proof of hedge)."
      ],
      "discriminator": [
        124,
        56,
        44,
        65,
        31,
        31,
        117,
        169
      ],
      "accounts": [
        {
          "name": "operator",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "campaign",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "contractsAdded",
          "type": "u64"
        },
        {
          "name": "avgPriceMicros",
          "type": "u64"
        },
        {
          "name": "orderRefHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "setPaused",
      "docs": [
        "Merchant or operator: pause / resume sales."
      ],
      "discriminator": [
        91,
        60,
        125,
        192,
        176,
        225,
        166,
        218
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "The campaign's merchant or the operator."
          ],
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "campaign",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "paused",
          "type": "bool"
        }
      ]
    },
    {
      "name": "settle",
      "docs": [
        "Operator only, after the market resolves."
      ],
      "discriminator": [
        175,
        42,
        185,
        87,
        144,
        131,
        102,
        212
      ],
      "accounts": [
        {
          "name": "operator",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "campaign",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "outcome",
          "type": {
            "defined": {
              "name": "outcome"
            }
          }
        }
      ]
    },
    {
      "name": "updateConfig",
      "docs": [
        "Admin only: rotate the operator and/or treasury."
      ],
      "discriminator": [
        29,
        158,
        252,
        191,
        10,
        83,
        219,
        99
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "treasury"
        }
      ],
      "args": [
        {
          "name": "operator",
          "type": "pubkey"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "campaign",
      "discriminator": [
        50,
        40,
        49,
        11,
        157,
        220,
        229,
        192
      ]
    },
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    }
  ],
  "events": [
    {
      "name": "campaignCancelled",
      "discriminator": [
        121,
        171,
        21,
        55,
        56,
        234,
        121,
        44
      ]
    },
    {
      "name": "campaignCreated",
      "discriminator": [
        9,
        98,
        69,
        61,
        53,
        131,
        64,
        152
      ]
    },
    {
      "name": "campaignPauseChanged",
      "discriminator": [
        78,
        182,
        121,
        117,
        37,
        250,
        205,
        111
      ]
    },
    {
      "name": "campaignSettled",
      "discriminator": [
        117,
        145,
        212,
        210,
        201,
        63,
        135,
        24
      ]
    },
    {
      "name": "claimsClosed",
      "discriminator": [
        218,
        185,
        246,
        42,
        164,
        178,
        89,
        108
      ]
    },
    {
      "name": "configInitialized",
      "discriminator": [
        181,
        49,
        200,
        156,
        19,
        167,
        178,
        91
      ]
    },
    {
      "name": "configUpdated",
      "discriminator": [
        40,
        241,
        230,
        122,
        11,
        19,
        198,
        194
      ]
    },
    {
      "name": "hedgeRecorded",
      "discriminator": [
        139,
        25,
        204,
        171,
        216,
        23,
        24,
        96
      ]
    },
    {
      "name": "payoutEvent",
      "discriminator": [
        84,
        234,
        195,
        72,
        143,
        79,
        70,
        82
      ]
    },
    {
      "name": "purchaseEvent",
      "discriminator": [
        229,
        118,
        246,
        164,
        59,
        65,
        116,
        254
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "Signer is not allowed to perform this action"
    },
    {
      "code": 6001,
      "name": "invalidUsdcMint",
      "msg": "The campaign currency must have 6 decimals"
    },
    {
      "code": 6002,
      "name": "invalidTreasury",
      "msg": "Treasury must be a token account for the configured USDC mint"
    },
    {
      "code": 6003,
      "name": "invalidMerchantAccount",
      "msg": "Merchant payout account must hold the configured USDC mint"
    },
    {
      "code": 6004,
      "name": "invalidRefundBps",
      "msg": "Refund must be between 1 and 10000 bps"
    },
    {
      "code": 6005,
      "name": "invalidMaxPremiumBps",
      "msg": "Max cost per sale must be at most 10000 bps"
    },
    {
      "code": 6006,
      "name": "invalidMarketSymbol",
      "msg": "Market symbol must be 1 to 64 bytes"
    },
    {
      "code": 6007,
      "name": "invalidDeadline",
      "msg": "Sales deadline must be in the future"
    },
    {
      "code": 6008,
      "name": "invalidLiabilityCap",
      "msg": "Liability cap must be positive"
    },
    {
      "code": 6009,
      "name": "invalidMaxUnhedged",
      "msg": "max_unhedged cannot exceed the liability cap"
    },
    {
      "code": 6010,
      "name": "campaignNotOpen",
      "msg": "Campaign is not open for sales"
    },
    {
      "code": 6011,
      "name": "salesClosed",
      "msg": "The sales window for this promo has closed"
    },
    {
      "code": 6012,
      "name": "invalidAmount",
      "msg": "Amount must be positive"
    },
    {
      "code": 6013,
      "name": "premiumTooHigh",
      "msg": "Premium exceeds the merchant's maximum cost per sale"
    },
    {
      "code": 6014,
      "name": "refundTooSmall",
      "msg": "Refund rounds to zero for this amount"
    },
    {
      "code": 6015,
      "name": "liabilityCapExceeded",
      "msg": "This sale would exceed the campaign's liability cap"
    },
    {
      "code": 6016,
      "name": "unhedgedLimitExceeded",
      "msg": "This sale would leave more refunds unhedged than max_unhedged allows"
    },
    {
      "code": 6017,
      "name": "mathOverflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6018,
      "name": "invalidContracts",
      "msg": "contracts_added must be positive"
    },
    {
      "code": 6019,
      "name": "campaignClosed",
      "msg": "Campaign is already settled or cancelled"
    },
    {
      "code": 6020,
      "name": "invalidOutcome",
      "msg": "Outcome must be Yes or No"
    },
    {
      "code": 6021,
      "name": "notSettled",
      "msg": "Campaign has not settled"
    },
    {
      "code": 6022,
      "name": "outcomeNotYes",
      "msg": "Campaign did not settle Yes; claims pay nothing"
    },
    {
      "code": 6023,
      "name": "claimsNotClosable",
      "msg": "Claims can only be closed after a No outcome or a cancellation"
    },
    {
      "code": 6024,
      "name": "nothingToPay",
      "msg": "This wallet holds no claims for the campaign"
    },
    {
      "code": 6025,
      "name": "campaignHasSales",
      "msg": "A campaign with sales cannot be cancelled; settle it instead"
    }
  ],
  "types": [
    {
      "name": "campaign",
      "docs": [
        "One promotion. PDA seeded by (`campaign`, merchant, campaign_id as u64 LE)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "merchant",
            "type": "pubkey"
          },
          {
            "name": "merchantUsdc",
            "docs": [
              "Where the merchant's share of each sale goes."
            ],
            "type": "pubkey"
          },
          {
            "name": "campaignId",
            "type": "u64"
          },
          {
            "name": "marketSymbol",
            "docs": [
              "Gemini prediction-market symbol whose YES outcome triggers refunds."
            ],
            "type": "string"
          },
          {
            "name": "refundBps",
            "docs": [
              "Refund owed on YES, as bps of the sale amount."
            ],
            "type": "u16"
          },
          {
            "name": "maxPremiumBps",
            "docs": [
              "The merchant's maximum cost per sale (premium), as bps of the sale amount."
            ],
            "type": "u16"
          },
          {
            "name": "liabilityCap",
            "docs": [
              "Maximum total refunds that may ever be promised (USDC base units)."
            ],
            "type": "u64"
          },
          {
            "name": "maxUnhedged",
            "docs": [
              "Maximum refunds promised but not yet covered by hedged contracts (USDC base units)."
            ],
            "type": "u64"
          },
          {
            "name": "salesDeadline",
            "docs": [
              "Unix timestamp after which purchases are rejected."
            ],
            "type": "i64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "campaignStatus"
              }
            }
          },
          {
            "name": "outcome",
            "type": {
              "defined": {
                "name": "outcome"
              }
            }
          },
          {
            "name": "liability",
            "docs": [
              "Total refunds promised (USDC base units) == claim mint supply before payouts."
            ],
            "type": "u64"
          },
          {
            "name": "hedgedContracts",
            "docs": [
              "Contracts bought on the prediction market; each covers CONTRACT_UNIT of liability."
            ],
            "type": "u64"
          },
          {
            "name": "claimMint",
            "type": "pubkey"
          },
          {
            "name": "refundVault",
            "type": "pubkey"
          },
          {
            "name": "totalSales",
            "type": "u64"
          },
          {
            "name": "totalPremium",
            "type": "u64"
          },
          {
            "name": "totalPaidOut",
            "type": "u64"
          },
          {
            "name": "purchaseCount",
            "type": "u32"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "settledAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "claimMintBump",
            "type": "u8"
          },
          {
            "name": "refundVaultBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "campaignCancelled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "campaign",
            "type": "pubkey"
          },
          {
            "name": "by",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "campaignCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "campaign",
            "type": "pubkey"
          },
          {
            "name": "merchant",
            "type": "pubkey"
          },
          {
            "name": "campaignId",
            "type": "u64"
          },
          {
            "name": "marketSymbol",
            "type": "string"
          },
          {
            "name": "refundBps",
            "type": "u16"
          },
          {
            "name": "maxPremiumBps",
            "type": "u16"
          },
          {
            "name": "liabilityCap",
            "type": "u64"
          },
          {
            "name": "maxUnhedged",
            "type": "u64"
          },
          {
            "name": "salesDeadline",
            "type": "i64"
          },
          {
            "name": "merchantUsdc",
            "type": "pubkey"
          },
          {
            "name": "claimMint",
            "type": "pubkey"
          },
          {
            "name": "refundVault",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "campaignPauseChanged",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "campaign",
            "type": "pubkey"
          },
          {
            "name": "paused",
            "type": "bool"
          },
          {
            "name": "by",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "campaignSettled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "campaign",
            "type": "pubkey"
          },
          {
            "name": "outcome",
            "type": {
              "defined": {
                "name": "outcome"
              }
            }
          },
          {
            "name": "liability",
            "type": "u64"
          },
          {
            "name": "hedgedContracts",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "campaignStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "open"
          },
          {
            "name": "paused"
          },
          {
            "name": "settled"
          },
          {
            "name": "cancelled"
          }
        ]
      }
    },
    {
      "name": "claimsClosed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "campaign",
            "type": "pubkey"
          },
          {
            "name": "customer",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "config",
      "docs": [
        "Global settings. One per program (PDA seeded by `config`)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "docs": [
              "The program's upgrade authority at initialization; may rotate the operator / treasury."
            ],
            "type": "pubkey"
          },
          {
            "name": "operator",
            "docs": [
              "Prices sales (co-signs every purchase), records hedges, settles campaigns."
            ],
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "docs": [
              "Token account that receives every premium."
            ],
            "type": "pubkey"
          },
          {
            "name": "usdcMint",
            "docs": [
              "Campaign currency (USDC or the mock dUSDC); equals `treasury.mint`."
            ],
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "configInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "operator",
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "usdcMint",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "configUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "operator",
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "createCampaignParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "campaignId",
            "docs": [
              "Merchant-chosen id; the campaign PDA is seeded by (merchant, campaign_id)."
            ],
            "type": "u64"
          },
          {
            "name": "marketSymbol",
            "docs": [
              "Gemini prediction-market symbol (max 64 bytes)."
            ],
            "type": "string"
          },
          {
            "name": "refundBps",
            "docs": [
              "Refund on YES, in bps of the sale (10_000 = everything free)."
            ],
            "type": "u16"
          },
          {
            "name": "maxPremiumBps",
            "docs": [
              "Merchant's maximum cost per sale, in bps of the sale."
            ],
            "type": "u16"
          },
          {
            "name": "liabilityCap",
            "docs": [
              "Maximum total refunds (USDC base units)."
            ],
            "type": "u64"
          },
          {
            "name": "maxUnhedged",
            "docs": [
              "Maximum refunds promised but not yet hedged (USDC base units)."
            ],
            "type": "u64"
          },
          {
            "name": "salesDeadline",
            "docs": [
              "Unix timestamp after which sales are rejected."
            ],
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "hedgeRecorded",
      "docs": [
        "The on-chain proof-of-hedge record."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "campaign",
            "type": "pubkey"
          },
          {
            "name": "contractsAdded",
            "type": "u64"
          },
          {
            "name": "hedgedContracts",
            "type": "u64"
          },
          {
            "name": "avgPriceMicros",
            "type": "u64"
          },
          {
            "name": "orderRefHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "liability",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "outcome",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "none"
          },
          {
            "name": "yes"
          },
          {
            "name": "no"
          }
        ]
      }
    },
    {
      "name": "payoutEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "campaign",
            "type": "pubkey"
          },
          {
            "name": "customer",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "totalPaidOut",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "purchaseEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "campaign",
            "type": "pubkey"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "premium",
            "type": "u64"
          },
          {
            "name": "refund",
            "type": "u64"
          },
          {
            "name": "liabilityAfter",
            "type": "u64"
          },
          {
            "name": "hedgedContracts",
            "type": "u64"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "campaignSeed",
      "type": "bytes",
      "value": "[99, 97, 109, 112, 97, 105, 103, 110]"
    },
    {
      "name": "claimMintSeed",
      "type": "bytes",
      "value": "[99, 108, 97, 105, 109, 95, 109, 105, 110, 116]"
    },
    {
      "name": "configSeed",
      "type": "bytes",
      "value": "[99, 111, 110, 102, 105, 103]"
    },
    {
      "name": "contractUnit",
      "docs": [
        "One prediction-market contract pays $1 on YES = 1_000_000 USDC base units."
      ],
      "type": "u64",
      "value": "1000000"
    },
    {
      "name": "refundVaultSeed",
      "type": "bytes",
      "value": "[114, 101, 102, 117, 110, 100, 95, 118, 97, 117, 108, 116]"
    }
  ]
};
