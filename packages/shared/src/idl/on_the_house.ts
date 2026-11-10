/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/on_the_house.json`.
 */
export type OnTheHouse = {
  "accounts": [
    {
      "discriminator": [
        50,
        40,
        49,
        11,
        157,
        220,
        229,
        192
      ],
      "name": "campaign"
    },
    {
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ],
      "name": "config"
    }
  ],
  "address": "4qfLMXZTmKt71eDH4S3VNSDCRFPX7qxpPk3WZZgt2PM2",
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
      "docs": [
        "One prediction-market contract pays $1 on YES = 1_000_000 USDC base units."
      ],
      "name": "contractUnit",
      "type": "u64",
      "value": "1000000"
    },
    {
      "name": "refundVaultSeed",
      "type": "bytes",
      "value": "[114, 101, 102, 117, 110, 100, 95, 118, 97, 117, 108, 116]"
    }
  ],
  "errors": [
    {
      "code": 6000,
      "msg": "Signer is not allowed to perform this action",
      "name": "unauthorized"
    },
    {
      "code": 6001,
      "msg": "The campaign currency must have 6 decimals",
      "name": "invalidUsdcMint"
    },
    {
      "code": 6002,
      "msg": "Treasury must be a token account for the configured USDC mint",
      "name": "invalidTreasury"
    },
    {
      "code": 6003,
      "msg": "Merchant payout account must hold the configured USDC mint",
      "name": "invalidMerchantAccount"
    },
    {
      "code": 6004,
      "msg": "Refund must be between 1 and 10000 bps",
      "name": "invalidRefundBps"
    },
    {
      "code": 6005,
      "msg": "Max cost per sale must be at most 10000 bps",
      "name": "invalidMaxPremiumBps"
    },
    {
      "code": 6006,
      "msg": "Market symbol must be 1 to 64 bytes",
      "name": "invalidMarketSymbol"
    },
    {
      "code": 6007,
      "msg": "Sales deadline must be in the future",
      "name": "invalidDeadline"
    },
    {
      "code": 6008,
      "msg": "Liability cap must be positive",
      "name": "invalidLiabilityCap"
    },
    {
      "code": 6009,
      "msg": "max_unhedged cannot exceed the liability cap",
      "name": "invalidMaxUnhedged"
    },
    {
      "code": 6010,
      "msg": "Campaign is not open for sales",
      "name": "campaignNotOpen"
    },
    {
      "code": 6011,
      "msg": "The sales window for this promo has closed",
      "name": "salesClosed"
    },
    {
      "code": 6012,
      "msg": "Amount must be positive",
      "name": "invalidAmount"
    },
    {
      "code": 6013,
      "msg": "Premium exceeds the merchant's maximum cost per sale",
      "name": "premiumTooHigh"
    },
    {
      "code": 6014,
      "msg": "Refund rounds to zero for this amount",
      "name": "refundTooSmall"
    },
    {
      "code": 6015,
      "msg": "This sale would exceed the campaign's liability cap",
      "name": "liabilityCapExceeded"
    },
    {
      "code": 6016,
      "msg": "This sale would leave more refunds unhedged than max_unhedged allows",
      "name": "unhedgedLimitExceeded"
    },
    {
      "code": 6017,
      "msg": "Arithmetic overflow",
      "name": "mathOverflow"
    },
    {
      "code": 6018,
      "msg": "contracts_added must be positive",
      "name": "invalidContracts"
    },
    {
      "code": 6019,
      "msg": "Campaign is already settled or cancelled",
      "name": "campaignClosed"
    },
    {
      "code": 6020,
      "msg": "Outcome must be Yes or No",
      "name": "invalidOutcome"
    },
    {
      "code": 6021,
      "msg": "Campaign has not settled",
      "name": "notSettled"
    },
    {
      "code": 6022,
      "msg": "Campaign did not settle Yes; claims pay nothing",
      "name": "outcomeNotYes"
    },
    {
      "code": 6023,
      "msg": "Claims can only be closed after a No outcome or a cancellation",
      "name": "claimsNotClosable"
    },
    {
      "code": 6024,
      "msg": "This wallet holds no claims for the campaign",
      "name": "nothingToPay"
    },
    {
      "code": 6025,
      "msg": "A campaign with sales cannot be cancelled; settle it instead",
      "name": "campaignHasSales"
    }
  ],
  "events": [
    {
      "discriminator": [
        121,
        171,
        21,
        55,
        56,
        234,
        121,
        44
      ],
      "name": "campaignCancelled"
    },
    {
      "discriminator": [
        9,
        98,
        69,
        61,
        53,
        131,
        64,
        152
      ],
      "name": "campaignCreated"
    },
    {
      "discriminator": [
        78,
        182,
        121,
        117,
        37,
        250,
        205,
        111
      ],
      "name": "campaignPauseChanged"
    },
    {
      "discriminator": [
        117,
        145,
        212,
        210,
        201,
        63,
        135,
        24
      ],
      "name": "campaignSettled"
    },
    {
      "discriminator": [
        218,
        185,
        246,
        42,
        164,
        178,
        89,
        108
      ],
      "name": "claimsClosed"
    },
    {
      "discriminator": [
        181,
        49,
        200,
        156,
        19,
        167,
        178,
        91
      ],
      "name": "configInitialized"
    },
    {
      "discriminator": [
        40,
        241,
        230,
        122,
        11,
        19,
        198,
        194
      ],
      "name": "configUpdated"
    },
    {
      "discriminator": [
        139,
        25,
        204,
        171,
        216,
        23,
        24,
        96
      ],
      "name": "hedgeRecorded"
    },
    {
      "discriminator": [
        84,
        234,
        195,
        72,
        143,
        79,
        70,
        82
      ],
      "name": "payoutEvent"
    },
    {
      "discriminator": [
        229,
        118,
        246,
        164,
        59,
        65,
        116,
        254
      ],
      "name": "purchaseEvent"
    }
  ],
  "instructions": [
    {
      "accounts": [
        {
          "docs": [
            "The campaign's merchant or the operator."
          ],
          "name": "authority",
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
      "args": [],
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
      "docs": [
        "Merchant or operator: cancel a campaign that has no sales."
      ],
      "name": "cancelCampaign"
    },
    {
      "accounts": [
        {
          "name": "customer"
        },
        {
          "name": "campaign"
        },
        {
          "name": "claimMint",
          "relations": [
            "campaign"
          ],
          "writable": true
        },
        {
          "name": "customerClaim",
          "pda": {
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
            },
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
            ]
          },
          "writable": true
        },
        {
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
          "name": "claimTokenProgram"
        }
      ],
      "args": [],
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
      "docs": [
        "Permissionless crank after a No outcome (or a cancellation): burns worthless claims."
      ],
      "name": "closeClaims"
    },
    {
      "accounts": [
        {
          "docs": [
            "Pays rent for the campaign, claim mint and refund vault (the operator in the demo)."
          ],
          "name": "payer",
          "signer": true,
          "writable": true
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
          },
          "writable": true
        },
        {
          "name": "usdcMint"
        },
        {
          "docs": [
            "Receives the merchant's share of every sale."
          ],
          "name": "merchantUsdc"
        },
        {
          "docs": [
            "and PermanentDelegate extensions (Anchor's `init` constraints cannot add NonTransferable).",
            "The seeds constraint pins the address."
          ],
          "name": "claimMint",
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
          },
          "writable": true
        },
        {
          "docs": [
            "Holds the USDC that pays refunds; the campaign PDA is its authority."
          ],
          "name": "refundVault",
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
          },
          "writable": true
        },
        {
          "name": "usdcTokenProgram"
        },
        {
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
          "name": "claimTokenProgram"
        },
        {
          "address": "11111111111111111111111111111111",
          "name": "systemProgram"
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
      "docs": [
        "Signed by the merchant. Creates the campaign, its claim mint and its refund vault."
      ],
      "name": "createCampaign"
    },
    {
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "writable": true
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
          },
          "writable": true
        },
        {
          "docs": [
            "The campaign currency (USDC or the mock dUSDC)."
          ],
          "name": "usdcMint"
        },
        {
          "docs": [
            "Platform treasury token account: receives every premium."
          ],
          "name": "treasury"
        },
        {
          "address": "4qfLMXZTmKt71eDH4S3VNSDCRFPX7qxpPk3WZZgt2PM2",
          "docs": [
            "\"Admin only\": the signer must be this program's upgrade authority, so nobody can",
            "front-run the deployer and take over the config."
          ],
          "name": "program"
        },
        {
          "name": "programData"
        },
        {
          "name": "usdcTokenProgram"
        },
        {
          "address": "11111111111111111111111111111111",
          "name": "systemProgram"
        }
      ],
      "args": [
        {
          "name": "operator",
          "type": "pubkey"
        }
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
      "docs": [
        "One-time setup. Only the program's upgrade authority may call it."
      ],
      "name": "initializeConfig"
    },
    {
      "accounts": [
        {
          "docs": [
            "Anyone may crank. Pays rent only if the customer's USDC account has to be (re)created."
          ],
          "name": "payer",
          "signer": true,
          "writable": true
        },
        {
          "docs": [
            "validated as this wallet's associated token accounts."
          ],
          "name": "customer"
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
          "relations": [
            "campaign"
          ],
          "writable": true
        },
        {
          "name": "customerClaim",
          "pda": {
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
            },
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
            ]
          },
          "writable": true
        },
        {
          "name": "refundVault",
          "relations": [
            "campaign"
          ],
          "writable": true
        },
        {
          "name": "customerUsdc",
          "pda": {
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
            },
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
            ]
          },
          "writable": true
        },
        {
          "name": "usdcTokenProgram"
        },
        {
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
          "name": "claimTokenProgram"
        },
        {
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
          "name": "associatedTokenProgram"
        },
        {
          "address": "11111111111111111111111111111111",
          "name": "systemProgram"
        }
      ],
      "args": [],
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
      "docs": [
        "Permissionless crank after a Yes outcome: burns the customer's claims, pays the same in USDC."
      ],
      "name": "payout"
    },
    {
      "accounts": [
        {
          "docs": [
            "Fee payer and rent payer (customers need zero SOL). Its signature also authorizes the premium."
          ],
          "name": "operator",
          "relations": [
            "config"
          ],
          "signer": true,
          "writable": true
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
          "relations": [
            "campaign"
          ],
          "writable": true
        },
        {
          "name": "treasury",
          "relations": [
            "config"
          ],
          "writable": true
        },
        {
          "name": "claimMint",
          "relations": [
            "campaign"
          ],
          "writable": true
        },
        {
          "docs": [
            "The customer's (non-transferable) claim account, created on first purchase at the operator's expense."
          ],
          "name": "customerClaim",
          "pda": {
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
            },
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
            ]
          },
          "writable": true
        },
        {
          "name": "usdcTokenProgram"
        },
        {
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
          "name": "claimTokenProgram"
        },
        {
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
          "name": "associatedTokenProgram"
        },
        {
          "address": "11111111111111111111111111111111",
          "name": "systemProgram"
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
      "docs": [
        "Signed by the customer and the operator (fee payer, price authority)."
      ],
      "name": "purchase"
    },
    {
      "accounts": [
        {
          "name": "operator",
          "relations": [
            "config"
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
      "docs": [
        "Operator only: record contracts bought on the prediction market (proof of hedge)."
      ],
      "name": "recordHedge"
    },
    {
      "accounts": [
        {
          "docs": [
            "The campaign's merchant or the operator."
          ],
          "name": "authority",
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
      "docs": [
        "Merchant or operator: pause / resume sales."
      ],
      "name": "setPaused"
    },
    {
      "accounts": [
        {
          "name": "operator",
          "relations": [
            "config"
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
          "name": "outcome",
          "type": {
            "defined": {
              "name": "outcome"
            }
          }
        }
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
      "docs": [
        "Operator only, after the market resolves."
      ],
      "name": "settle"
    },
    {
      "accounts": [
        {
          "name": "admin",
          "relations": [
            "config"
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
          },
          "writable": true
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
      "docs": [
        "Admin only: rotate the operator and/or treasury."
      ],
      "name": "updateConfig"
    }
  ],
  "metadata": {
    "description": "On the House: event-contingent shop promos with non-transferable refund claims, hedged on prediction markets",
    "name": "onTheHouse",
    "spec": "0.1.0",
    "version": "0.1.0"
  },
  "types": [
    {
      "docs": [
        "One promotion. PDA seeded by (`campaign`, merchant, campaign_id as u64 LE)."
      ],
      "name": "campaign",
      "type": {
        "fields": [
          {
            "name": "merchant",
            "type": "pubkey"
          },
          {
            "docs": [
              "Where the merchant's share of each sale goes."
            ],
            "name": "merchantUsdc",
            "type": "pubkey"
          },
          {
            "name": "campaignId",
            "type": "u64"
          },
          {
            "docs": [
              "Gemini prediction-market symbol whose YES outcome triggers refunds."
            ],
            "name": "marketSymbol",
            "type": "string"
          },
          {
            "docs": [
              "Refund owed on YES, as bps of the sale amount."
            ],
            "name": "refundBps",
            "type": "u16"
          },
          {
            "docs": [
              "The merchant's maximum cost per sale (premium), as bps of the sale amount."
            ],
            "name": "maxPremiumBps",
            "type": "u16"
          },
          {
            "docs": [
              "Maximum total refunds that may ever be promised (USDC base units)."
            ],
            "name": "liabilityCap",
            "type": "u64"
          },
          {
            "docs": [
              "Maximum refunds promised but not yet covered by hedged contracts (USDC base units)."
            ],
            "name": "maxUnhedged",
            "type": "u64"
          },
          {
            "docs": [
              "Unix timestamp after which purchases are rejected."
            ],
            "name": "salesDeadline",
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
            "docs": [
              "Total refunds promised (USDC base units) == claim mint supply before payouts."
            ],
            "name": "liability",
            "type": "u64"
          },
          {
            "docs": [
              "Contracts bought on the prediction market; each covers CONTRACT_UNIT of liability."
            ],
            "name": "hedgedContracts",
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
        ],
        "kind": "struct"
      }
    },
    {
      "name": "campaignCancelled",
      "type": {
        "fields": [
          {
            "name": "campaign",
            "type": "pubkey"
          },
          {
            "name": "by",
            "type": "pubkey"
          }
        ],
        "kind": "struct"
      }
    },
    {
      "name": "campaignCreated",
      "type": {
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
        ],
        "kind": "struct"
      }
    },
    {
      "name": "campaignPauseChanged",
      "type": {
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
        ],
        "kind": "struct"
      }
    },
    {
      "name": "campaignSettled",
      "type": {
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
        ],
        "kind": "struct"
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
        ],
        "kind": "struct"
      }
    },
    {
      "docs": [
        "Global settings. One per program (PDA seeded by `config`)."
      ],
      "name": "config",
      "type": {
        "fields": [
          {
            "docs": [
              "The program's upgrade authority at initialization; may rotate the operator / treasury."
            ],
            "name": "admin",
            "type": "pubkey"
          },
          {
            "docs": [
              "Prices sales (co-signs every purchase), records hedges, settles campaigns."
            ],
            "name": "operator",
            "type": "pubkey"
          },
          {
            "docs": [
              "Token account that receives every premium."
            ],
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "docs": [
              "Campaign currency (USDC or the mock dUSDC); equals `treasury.mint`."
            ],
            "name": "usdcMint",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ],
        "kind": "struct"
      }
    },
    {
      "name": "configInitialized",
      "type": {
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
        ],
        "kind": "struct"
      }
    },
    {
      "name": "configUpdated",
      "type": {
        "fields": [
          {
            "name": "operator",
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          }
        ],
        "kind": "struct"
      }
    },
    {
      "name": "createCampaignParams",
      "type": {
        "fields": [
          {
            "docs": [
              "Merchant-chosen id; the campaign PDA is seeded by (merchant, campaign_id)."
            ],
            "name": "campaignId",
            "type": "u64"
          },
          {
            "docs": [
              "Gemini prediction-market symbol (max 64 bytes)."
            ],
            "name": "marketSymbol",
            "type": "string"
          },
          {
            "docs": [
              "Refund on YES, in bps of the sale (10_000 = everything free)."
            ],
            "name": "refundBps",
            "type": "u16"
          },
          {
            "docs": [
              "Merchant's maximum cost per sale, in bps of the sale."
            ],
            "name": "maxPremiumBps",
            "type": "u16"
          },
          {
            "docs": [
              "Maximum total refunds (USDC base units)."
            ],
            "name": "liabilityCap",
            "type": "u64"
          },
          {
            "docs": [
              "Maximum refunds promised but not yet hedged (USDC base units)."
            ],
            "name": "maxUnhedged",
            "type": "u64"
          },
          {
            "docs": [
              "Unix timestamp after which sales are rejected."
            ],
            "name": "salesDeadline",
            "type": "i64"
          }
        ],
        "kind": "struct"
      }
    },
    {
      "docs": [
        "The on-chain proof-of-hedge record."
      ],
      "name": "hedgeRecorded",
      "type": {
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
        ],
        "kind": "struct"
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
        ],
        "kind": "struct"
      }
    },
    {
      "name": "purchaseEvent",
      "type": {
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
        ],
        "kind": "struct"
      }
    }
  ]
};
