/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/contract.json`.
 */
export type Contract = {
  address: "2LEm66V2Ys8JbVoQfYbZqCy6YGM1wuPUc843xRx76t3P";
  metadata: {
    name: "contract";
    version: "0.1.0";
    spec: "0.1.0";
    description: "SolMarket Anchor program";
  };
  instructions: [
    {
      name: "adminPauseMarket";
      discriminator: [38, 198, 102, 223, 212, 178, 41, 189];
      accounts: [
        {
          name: "config";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: "admin";
          signer: true;
          relations: ["config"];
        },
        {
          name: "market";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [109, 97, 114, 107, 101, 116];
              },
              {
                kind: "account";
                path: "market.polymarket_market_id_hash";
                account: "market";
              },
            ];
          };
        },
      ];
      args: [];
    },
    {
      name: "adminUnpauseMarket";
      discriminator: [245, 125, 102, 62, 71, 18, 209, 208];
      accounts: [
        {
          name: "config";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: "admin";
          signer: true;
          relations: ["config"];
        },
        {
          name: "market";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [109, 97, 114, 107, 101, 116];
              },
              {
                kind: "account";
                path: "market.polymarket_market_id_hash";
                account: "market";
              },
            ];
          };
        },
      ];
      args: [];
    },
    {
      name: "claim";
      discriminator: [62, 198, 214, 193, 213, 159, 108, 210];
      accounts: [
        {
          name: "user";
          writable: true;
          signer: true;
          relations: ["userPosition"];
        },
        {
          name: "config";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: "market";
          relations: ["userPosition"];
        },
        {
          name: "userPosition";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [112, 111, 115, 105, 116, 105, 111, 110];
              },
              {
                kind: "account";
                path: "user";
              },
              {
                kind: "account";
                path: "market";
              },
            ];
          };
        },
        {
          name: "userUsdc";
          writable: true;
        },
        {
          name: "treasuryVault";
          writable: true;
        },
        {
          name: "treasuryAuthority";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
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
                  121,
                ];
              },
            ];
          };
        },
        {
          name: "tokenProgram";
          address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        },
      ];
      args: [];
    },
    {
      name: "createMarket";
      discriminator: [103, 226, 97, 235, 200, 188, 251, 254];
      accounts: [
        {
          name: "admin";
          writable: true;
          signer: true;
          relations: ["config"];
        },
        {
          name: "config";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: "market";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [109, 97, 114, 107, 101, 116];
              },
              {
                kind: "arg";
                path: "polymarketMarketIdHash";
              },
            ];
          };
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [
        {
          name: "polymarketMarketIdHash";
          type: {
            array: ["u8", 32];
          };
        },
        {
          name: "polymarketMarketId";
          type: "string";
        },
        {
          name: "questionHash";
          type: {
            array: ["u8", 32];
          };
        },
        {
          name: "endTime";
          type: "i64";
        },
        {
          name: "tickSize";
          type: "u16";
        },
        {
          name: "yesTokenId";
          type: "string";
        },
        {
          name: "noTokenId";
          type: "string";
        },
      ];
    },
    {
      name: "initializeConfig";
      discriminator: [208, 127, 21, 1, 194, 190, 196, 70];
      accounts: [
        {
          name: "admin";
          writable: true;
          signer: true;
        },
        {
          name: "config";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: "treasuryAuthority";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
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
                  121,
                ];
              },
            ];
          };
        },
        {
          name: "treasuryVault";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [116, 114, 101, 97, 115, 117, 114, 121, 95, 118, 97, 117, 108, 116];
              },
            ];
          };
        },
        {
          name: "usdcMint";
        },
        {
          name: "tokenProgram";
          address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        },
        {
          name: "rent";
          address: "SysvarRent111111111111111111111111111111111";
        },
      ];
      args: [
        {
          name: "oracleSigner";
          type: "pubkey";
        },
        {
          name: "quoteSigner";
          type: "pubkey";
        },
      ];
    },
    {
      name: "placeOrder";
      discriminator: [51, 194, 155, 175, 109, 130, 96, 106];
      accounts: [
        {
          name: "user";
          writable: true;
          signer: true;
        },
        {
          name: "feePayer";
          writable: true;
          signer: true;
        },
        {
          name: "config";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: "market";
          writable: true;
        },
        {
          name: "userPosition";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [112, 111, 115, 105, 116, 105, 111, 110];
              },
              {
                kind: "account";
                path: "user";
              },
              {
                kind: "account";
                path: "market";
              },
            ];
          };
        },
        {
          name: "usedNonce";
          writable: true;
        },
        {
          name: "userUsdc";
          writable: true;
        },
        {
          name: "treasuryVault";
          writable: true;
        },
        {
          name: "treasuryAuthority";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
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
                  121,
                ];
              },
            ];
          };
        },
        {
          name: "instructionsSysvar";
          address: "Sysvar1nstructions1111111111111111111111111";
        },
        {
          name: "tokenProgram";
          address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [
        {
          name: "quote";
          type: {
            defined: {
              name: "signedQuote";
            };
          };
        },
      ];
    },
    {
      name: "resolveMarket";
      discriminator: [155, 23, 80, 173, 46, 74, 23, 239];
      accounts: [
        {
          name: "config";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: "oracleSigner";
          signer: true;
          relations: ["config"];
        },
        {
          name: "market";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [109, 97, 114, 107, 101, 116];
              },
              {
                kind: "account";
                path: "market.polymarket_market_id_hash";
                account: "market";
              },
            ];
          };
        },
      ];
      args: [
        {
          name: "winningOutcome";
          type: "u8";
        },
      ];
    },
  ];
  accounts: [
    {
      name: "config";
      discriminator: [155, 12, 170, 224, 30, 250, 204, 130];
    },
    {
      name: "market";
      discriminator: [219, 190, 213, 55, 0, 227, 198, 154];
    },
    {
      name: "usedNonce";
      discriminator: [212, 222, 157, 252, 130, 71, 179, 238];
    },
    {
      name: "userPosition";
      discriminator: [251, 248, 209, 245, 83, 234, 17, 27];
    },
  ];
  events: [
    {
      name: "claimed";
      discriminator: [217, 192, 123, 72, 108, 150, 248, 33];
    },
    {
      name: "marketResolved";
      discriminator: [89, 67, 230, 95, 143, 106, 199, 202];
    },
    {
      name: "orderFilled";
      discriminator: [120, 124, 109, 66, 249, 116, 174, 30];
    },
  ];
  errors: [
    {
      code: 6000;
      name: "quoteExpired";
      msg: "Quote has expired";
    },
    {
      code: 6001;
      name: "invalidSignature";
      msg: "Quote signature is invalid";
    },
    {
      code: 6002;
      name: "missingSignature";
      msg: "Missing ed25519 verification instruction";
    },
    {
      code: 6003;
      name: "nonceUsed";
      msg: "Nonce already used";
    },
    {
      code: 6004;
      name: "marketClosed";
      msg: "Market is not open";
    },
    {
      code: 6005;
      name: "marketPaused";
      msg: "Market is paused";
    },
    {
      code: 6006;
      name: "marketEnded";
      msg: "Market has ended";
    },
    {
      code: 6007;
      name: "marketNotResolved";
      msg: "Market has not been resolved yet";
    },
    {
      code: 6008;
      name: "marketMismatch";
      msg: "Quote's market does not match account";
    },
    {
      code: 6009;
      name: "invalidOutcome";
      msg: "Invalid outcome value";
    },
    {
      code: 6010;
      name: "invalidSide";
      msg: "Invalid side value";
    },
    {
      code: 6011;
      name: "invalidPrice";
      msg: "Invalid price value";
    },
    {
      code: 6012;
      name: "invalidSize";
      msg: "Invalid size value";
    },
    {
      code: 6013;
      name: "insufficientShares";
      msg: "Insufficient shares to sell";
    },
    {
      code: 6014;
      name: "noWinningShares";
      msg: "No winning shares to claim";
    },
    {
      code: 6015;
      name: "mathOverflow";
      msg: "Math overflow";
    },
    {
      code: 6016;
      name: "invalidMarketId";
      msg: "Provided market id hash does not match";
    },
    {
      code: 6017;
      name: "unauthorized";
      msg: "Unauthorized signer";
    },
  ];
  types: [
    {
      name: "claimed";
      type: {
        kind: "struct";
        fields: [
          {
            name: "user";
            type: "pubkey";
          },
          {
            name: "market";
            type: "pubkey";
          },
          {
            name: "outcome";
            type: "u8";
          },
          {
            name: "shares";
            type: "u64";
          },
          {
            name: "payout";
            type: "u64";
          },
        ];
      };
    },
    {
      name: "config";
      type: {
        kind: "struct";
        fields: [
          {
            name: "admin";
            type: "pubkey";
          },
          {
            name: "oracleSigner";
            type: "pubkey";
          },
          {
            name: "quoteSigner";
            type: "pubkey";
          },
          {
            name: "treasuryVault";
            type: "pubkey";
          },
          {
            name: "usdcMint";
            type: "pubkey";
          },
          {
            name: "treasuryAuthorityBump";
            type: "u8";
          },
          {
            name: "treasuryVaultBump";
            type: "u8";
          },
          {
            name: "bump";
            type: "u8";
          },
        ];
      };
    },
    {
      name: "market";
      type: {
        kind: "struct";
        fields: [
          {
            name: "polymarketMarketId";
            type: "string";
          },
          {
            name: "polymarketMarketIdHash";
            type: {
              array: ["u8", 32];
            };
          },
          {
            name: "questionHash";
            type: {
              array: ["u8", 32];
            };
          },
          {
            name: "endTime";
            type: "i64";
          },
          {
            name: "tickSize";
            type: "u16";
          },
          {
            name: "yesTokenId";
            type: "string";
          },
          {
            name: "noTokenId";
            type: "string";
          },
          {
            name: "status";
            type: {
              defined: {
                name: "marketStatus";
              };
            };
          },
          {
            name: "winningOutcome";
            type: {
              option: "u8";
            };
          },
          {
            name: "totalYes";
            type: "u64";
          },
          {
            name: "totalNo";
            type: "u64";
          },
          {
            name: "paused";
            type: "bool";
          },
          {
            name: "bump";
            type: "u8";
          },
        ];
      };
    },
    {
      name: "marketResolved";
      type: {
        kind: "struct";
        fields: [
          {
            name: "market";
            type: "pubkey";
          },
          {
            name: "winningOutcome";
            type: "u8";
          },
        ];
      };
    },
    {
      name: "marketStatus";
      type: {
        kind: "enum";
        variants: [
          {
            name: "open";
          },
          {
            name: "resolved";
          },
          {
            name: "cancelled";
          },
        ];
      };
    },
    {
      name: "orderFilled";
      type: {
        kind: "struct";
        fields: [
          {
            name: "user";
            type: "pubkey";
          },
          {
            name: "market";
            type: "pubkey";
          },
          {
            name: "polymarketMarketId";
            type: "string";
          },
          {
            name: "side";
            type: "u8";
          },
          {
            name: "outcome";
            type: "u8";
          },
          {
            name: "size";
            type: "u64";
          },
          {
            name: "price";
            type: "u16";
          },
          {
            name: "nonce";
            type: {
              array: ["u8", 16];
            };
          },
        ];
      };
    },
    {
      name: "signedQuote";
      type: {
        kind: "struct";
        fields: [
          {
            name: "market";
            type: "pubkey";
          },
          {
            name: "side";
            type: "u8";
          },
          {
            name: "outcome";
            type: "u8";
          },
          {
            name: "price";
            type: "u16";
          },
          {
            name: "size";
            type: "u64";
          },
          {
            name: "expiresAt";
            type: "i64";
          },
          {
            name: "nonce";
            type: {
              array: ["u8", 16];
            };
          },
        ];
      };
    },
    {
      name: "usedNonce";
      type: {
        kind: "struct";
        fields: [
          {
            name: "nonce";
            type: {
              array: ["u8", 16];
            };
          },
          {
            name: "bump";
            type: "u8";
          },
        ];
      };
    },
    {
      name: "userPosition";
      type: {
        kind: "struct";
        fields: [
          {
            name: "user";
            type: "pubkey";
          },
          {
            name: "market";
            type: "pubkey";
          },
          {
            name: "yesShares";
            type: "u64";
          },
          {
            name: "noShares";
            type: "u64";
          },
          {
            name: "bump";
            type: "u8";
          },
        ];
      };
    },
  ];
  constants: [
    {
      name: "configSeed";
      type: "bytes";
      value: "[99, 111, 110, 102, 105, 103]";
    },
    {
      name: "marketSeed";
      type: "bytes";
      value: "[109, 97, 114, 107, 101, 116]";
    },
    {
      name: "nonceSeed";
      type: "bytes";
      value: "[110, 111, 110, 99, 101]";
    },
    {
      name: "positionSeed";
      type: "bytes";
      value: "[112, 111, 115, 105, 116, 105, 111, 110]";
    },
    {
      name: "treasuryAuthoritySeed";
      type: "bytes";
      value: "[116, 114, 101, 97, 115, 117, 114, 121, 95, 97, 117, 116, 104, 111, 114, 105, 116, 121]";
    },
    {
      name: "treasuryVaultSeed";
      type: "bytes";
      value: "[116, 114, 101, 97, 115, 117, 114, 121, 95, 118, 97, 117, 108, 116]";
    },
  ];
};
