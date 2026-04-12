export const IDL = {
  "address": "6phzgYZv5a2k7iNKcoSjS9SaP8dzybtkVHjhcfHxWSL7",
  "metadata": {
    "name": "contract",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "SolMarket Anchor program"
  },
  "instructions": [
    {
      "name": "admin_pause_market",
      "discriminator": [
        38,
        198,
        102,
        223,
        212,
        178,
        41,
        189
      ],
      "accounts": [
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
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.polymarket_market_id_hash",
                "account": "Market"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "admin_unpause_market",
      "discriminator": [
        245,
        125,
        102,
        62,
        71,
        18,
        209,
        208
      ],
      "accounts": [
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
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.polymarket_market_id_hash",
                "account": "Market"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "claim",
      "discriminator": [
        62,
        198,
        214,
        193,
        213,
        159,
        108,
        210
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true,
          "relations": [
            "user_position"
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
          "name": "market",
          "relations": [
            "user_position"
          ]
        },
        {
          "name": "user_position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "user"
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "user_usdc",
          "writable": true
        },
        {
          "name": "treasury_vault",
          "writable": true
        },
        {
          "name": "treasury_authority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "create_market",
      "discriminator": [
        103,
        226,
        97,
        235,
        200,
        188,
        251,
        254
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
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
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "polymarket_market_id_hash"
              }
            ]
          }
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "polymarket_market_id_hash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "polymarket_market_id",
          "type": "string"
        },
        {
          "name": "question_hash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "end_time",
          "type": "i64"
        },
        {
          "name": "tick_size",
          "type": "u16"
        },
        {
          "name": "yes_token_id",
          "type": "string"
        },
        {
          "name": "no_token_id",
          "type": "string"
        }
      ]
    },
    {
      "name": "initialize_config",
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
          "name": "treasury_authority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "treasury_vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "usdc_mint"
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "oracle_signer",
          "type": "pubkey"
        },
        {
          "name": "quote_signer",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "place_order",
      "discriminator": [
        51,
        194,
        155,
        175,
        109,
        130,
        96,
        106
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
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
          "name": "market",
          "writable": true
        },
        {
          "name": "user_position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "user"
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "used_nonce",
          "writable": true
        },
        {
          "name": "user_usdc",
          "writable": true
        },
        {
          "name": "treasury_vault",
          "writable": true
        },
        {
          "name": "treasury_authority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "instructions_sysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "quote",
          "type": {
            "defined": {
              "name": "SignedQuote"
            }
          }
        }
      ]
    },
    {
      "name": "resolve_market",
      "discriminator": [
        155,
        23,
        80,
        173,
        46,
        74,
        23,
        239
      ],
      "accounts": [
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
          "name": "oracle_signer",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.polymarket_market_id_hash",
                "account": "Market"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "winning_outcome",
          "type": "u8"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "Config",
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
    },
    {
      "name": "Market",
      "discriminator": [
        219,
        190,
        213,
        55,
        0,
        227,
        198,
        154
      ]
    },
    {
      "name": "UsedNonce",
      "discriminator": [
        212,
        222,
        157,
        252,
        130,
        71,
        179,
        238
      ]
    },
    {
      "name": "UserPosition",
      "discriminator": [
        251,
        248,
        209,
        245,
        83,
        234,
        17,
        27
      ]
    }
  ],
  "events": [
    {
      "name": "Claimed",
      "discriminator": [
        217,
        192,
        123,
        72,
        108,
        150,
        248,
        33
      ]
    },
    {
      "name": "MarketResolved",
      "discriminator": [
        89,
        67,
        230,
        95,
        143,
        106,
        199,
        202
      ]
    },
    {
      "name": "OrderFilled",
      "discriminator": [
        120,
        124,
        109,
        66,
        249,
        116,
        174,
        30
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "QuoteExpired",
      "msg": "Quote has expired"
    },
    {
      "code": 6001,
      "name": "InvalidSignature",
      "msg": "Quote signature is invalid"
    },
    {
      "code": 6002,
      "name": "MissingSignature",
      "msg": "Missing ed25519 verification instruction"
    },
    {
      "code": 6003,
      "name": "NonceUsed",
      "msg": "Nonce already used"
    },
    {
      "code": 6004,
      "name": "MarketClosed",
      "msg": "Market is not open"
    },
    {
      "code": 6005,
      "name": "MarketPaused",
      "msg": "Market is paused"
    },
    {
      "code": 6006,
      "name": "MarketEnded",
      "msg": "Market has ended"
    },
    {
      "code": 6007,
      "name": "MarketNotResolved",
      "msg": "Market has not been resolved yet"
    },
    {
      "code": 6008,
      "name": "MarketMismatch",
      "msg": "Quote's market does not match account"
    },
    {
      "code": 6009,
      "name": "InvalidOutcome",
      "msg": "Invalid outcome value"
    },
    {
      "code": 6010,
      "name": "InvalidSide",
      "msg": "Invalid side value"
    },
    {
      "code": 6011,
      "name": "InvalidPrice",
      "msg": "Invalid price value"
    },
    {
      "code": 6012,
      "name": "InvalidSize",
      "msg": "Invalid size value"
    },
    {
      "code": 6013,
      "name": "InsufficientShares",
      "msg": "Insufficient shares to sell"
    },
    {
      "code": 6014,
      "name": "NoWinningShares",
      "msg": "No winning shares to claim"
    },
    {
      "code": 6015,
      "name": "MathOverflow",
      "msg": "Math overflow"
    },
    {
      "code": 6016,
      "name": "InvalidMarketId",
      "msg": "Provided market id hash does not match"
    },
    {
      "code": 6017,
      "name": "Unauthorized",
      "msg": "Unauthorized signer"
    }
  ],
  "types": [
    {
      "name": "Claimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "outcome",
            "type": "u8"
          },
          {
            "name": "shares",
            "type": "u64"
          },
          {
            "name": "payout",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "Config",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "oracle_signer",
            "type": "pubkey"
          },
          {
            "name": "quote_signer",
            "type": "pubkey"
          },
          {
            "name": "treasury_vault",
            "type": "pubkey"
          },
          {
            "name": "usdc_mint",
            "type": "pubkey"
          },
          {
            "name": "treasury_authority_bump",
            "type": "u8"
          },
          {
            "name": "treasury_vault_bump",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "Market",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "polymarket_market_id",
            "type": "string"
          },
          {
            "name": "polymarket_market_id_hash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "question_hash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "end_time",
            "type": "i64"
          },
          {
            "name": "tick_size",
            "type": "u16"
          },
          {
            "name": "yes_token_id",
            "type": "string"
          },
          {
            "name": "no_token_id",
            "type": "string"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "MarketStatus"
              }
            }
          },
          {
            "name": "winning_outcome",
            "type": {
              "option": "u8"
            }
          },
          {
            "name": "total_yes",
            "type": "u64"
          },
          {
            "name": "total_no",
            "type": "u64"
          },
          {
            "name": "paused",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "MarketResolved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "winning_outcome",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "MarketStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "Open"
          },
          {
            "name": "Resolved"
          },
          {
            "name": "Cancelled"
          }
        ]
      }
    },
    {
      "name": "OrderFilled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "polymarket_market_id",
            "type": "string"
          },
          {
            "name": "side",
            "type": "u8"
          },
          {
            "name": "outcome",
            "type": "u8"
          },
          {
            "name": "size",
            "type": "u64"
          },
          {
            "name": "price",
            "type": "u16"
          },
          {
            "name": "nonce",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          }
        ]
      }
    },
    {
      "name": "SignedQuote",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "side",
            "type": "u8"
          },
          {
            "name": "outcome",
            "type": "u8"
          },
          {
            "name": "price",
            "type": "u16"
          },
          {
            "name": "size",
            "type": "u64"
          },
          {
            "name": "expires_at",
            "type": "i64"
          },
          {
            "name": "nonce",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          }
        ]
      }
    },
    {
      "name": "UsedNonce",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "nonce",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "UserPosition",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "yes_shares",
            "type": "u64"
          },
          {
            "name": "no_shares",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "CONFIG_SEED",
      "type": "bytes",
      "value": "[99, 111, 110, 102, 105, 103]"
    },
    {
      "name": "MARKET_SEED",
      "type": "bytes",
      "value": "[109, 97, 114, 107, 101, 116]"
    },
    {
      "name": "NONCE_SEED",
      "type": "bytes",
      "value": "[110, 111, 110, 99, 101]"
    },
    {
      "name": "POSITION_SEED",
      "type": "bytes",
      "value": "[112, 111, 115, 105, 116, 105, 111, 110]"
    },
    {
      "name": "TREASURY_AUTHORITY_SEED",
      "type": "bytes",
      "value": "[116, 114, 101, 97, 115, 117, 114, 121, 95, 97, 117, 116, 104, 111, 114, 105, 116, 121]"
    },
    {
      "name": "TREASURY_VAULT_SEED",
      "type": "bytes",
      "value": "[116, 114, 101, 97, 115, 117, 114, 121, 95, 118, 97, 117, 108, 116]"
    }
  ]
} as const;
