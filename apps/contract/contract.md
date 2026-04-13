# SolMarket Contract — Instruction Reference

Program ID: `6phzgYZv5a2k7iNKcoSjS9SaP8dzybtkVHjhcfHxWSL7`

This document describes every instruction in the SolMarket Anchor program. For each instruction you'll find what it does, what it takes in, every account with its purpose, a line-by-line procedure of the handler logic, events emitted, and every possible error.

---

## 1. `initialize_config`

### What it does

One-time bootstrap that creates the global `Config` PDA and the program's shared USDC treasury vault. After this instruction lands, the program is ready to create markets and accept orders. Can only be called once — a second call fails because the Config PDA already exists.

### Parameters

| Name            | Type     | Description                                                                                                     |
| --------------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| `oracle_signer` | `Pubkey` | Public key authorized to resolve markets. Stored in Config so `resolve_market` can verify the caller.           |
| `quote_signer`  | `Pubkey` | Public key whose ed25519 signature is required on every `place_order` quote. This is the backend's signing key. |

### Accounts

| Account              | Type                     | Mutable | Signer | Why                                                                                                                                                                                                                                                |
| -------------------- | ------------------------ | ------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin`              | `Signer`                 | yes     | yes    | Pays for account creation rent. Stored as `config.admin` — only this key can create markets and pause/unpause.                                                                                                                                     |
| `config`             | `Config` (PDA)           | yes     | no     | The global config account being created. Seeds: `["config"]`. Stores admin, oracle_signer, quote_signer, treasury addresses, and bumps.                                                                                                            |
| `treasury_authority` | `UncheckedAccount` (PDA) | no      | no     | PDA that owns the treasury vault token account. Seeds: `["treasury_authority"]`. The program uses this PDA to sign CPI transfers out of the vault (for sells and claims). Not writable because it holds no data — it's purely a signing authority. |
| `treasury_vault`     | `TokenAccount` (PDA)     | yes     | no     | The USDC token account being created. Seeds: `["treasury_vault"]`. Holds all USDC deposited by buyers. Authority is set to `treasury_authority` so the program can transfer out via PDA signing.                                                   |
| `usdc_mint`          | `Mint`                   | no      | no     | The SPL token mint for USDC. Stored in Config so subsequent instructions can verify users pass the correct mint.                                                                                                                                   |
| `token_program`      | `Program<Token>`         | no      | no     | SPL Token program — needed to create the treasury vault token account.                                                                                                                                                                             |
| `system_program`     | `Program<System>`        | no      | no     | Needed to create the Config and treasury vault PDAs.                                                                                                                                                                                               |
| `rent`               | `Sysvar<Rent>`           | no      | no     | Needed for token account initialization rent calculation.                                                                                                                                                                                          |

### Procedure

> Source: `instructions/initialize_config.rs` — `handler()` starts at line 45

Before the handler runs, Anchor has already:

- Created the `Config` PDA at seeds `["config"]`, paid by `admin` (line 12–18)
- Created the `treasury_vault` token account PDA at seeds `["treasury_vault"]` with `mint = usdc_mint` and `authority = treasury_authority` (line 28–36)
- Derived the `treasury_authority` PDA at seeds `["treasury_authority"]` (line 22–26)

Then the handler runs:

```
line 1  │ fn handler(ctx, oracle_signer, quote_signer) → Result<()>
line 2  │
line 3  │ Get a mutable reference to the config account
line 4  │ Set config.admin = the admin who signed this transaction
line 5  │ Set config.oracle_signer = the oracle_signer pubkey from args
line 6  │ Set config.quote_signer = the quote_signer pubkey from args
line 7  │ Set config.treasury_vault = the treasury vault's on-chain address
line 8  │ Set config.usdc_mint = the USDC mint's on-chain address
line 9  │ Set config.treasury_authority_bump = bump used to derive treasury_authority PDA
line 10 │ Set config.treasury_vault_bump = bump used to derive treasury_vault PDA
line 11 │ Set config.bump = bump used to derive config PDA itself
line 12 │ Return Ok(())
```

That's it — no validation logic, no branching. All the safety comes from Anchor's `init` constraint (PDA already exists → tx fails).

### Events

None.

### Errors

| Error                        | When                                                       |
| ---------------------------- | ---------------------------------------------------------- |
| Anchor `AccountAlreadyInUse` | Config PDA already exists (second initialization attempt). |

---

## 2. `create_market`

### What it does

Creates a new prediction market linked to a Polymarket market. Admin-only. Each market is a PDA derived from the SHA-256 hash of the Polymarket market ID, so the same Polymarket market can only be listed once.

### Parameters

| Name                        | Type       | Description                                                                                                                             |
| --------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `polymarket_market_id_hash` | `[u8; 32]` | SHA-256 hash of `polymarket_market_id`. Used as the PDA seed. The program recomputes the hash on-chain and rejects if it doesn't match. |
| `polymarket_market_id`      | `String`   | The full Polymarket condition ID string (max 128 bytes). Stored in the Market account for event emission and backend lookups.           |
| `question_hash`             | `[u8; 32]` | SHA-256 hash of the market question text. Stored for frontend/indexer reference.                                                        |
| `end_time`                  | `i64`      | Unix timestamp after which the market stops accepting orders. Must be in the future.                                                    |
| `tick_size`                 | `u16`      | Minimum price increment (in cents). Must be > 0. Stored for the backend's quote engine.                                                 |
| `yes_token_id`              | `String`   | Polymarket's conditional token ID for the YES outcome (max 128 bytes).                                                                  |
| `no_token_id`               | `String`   | Polymarket's conditional token ID for the NO outcome (max 128 bytes).                                                                   |

### Accounts

| Account          | Type              | Mutable | Signer | Why                                                                               |
| ---------------- | ----------------- | ------- | ------ | --------------------------------------------------------------------------------- |
| `admin`          | `Signer`          | yes     | yes    | Must match `config.admin`. Pays rent for the new Market PDA.                      |
| `config`         | `Config` (PDA)    | no      | no     | Read to verify `has_one = admin`. Seeds: `["config"]`.                            |
| `market`         | `Market` (PDA)    | yes     | no     | The market account being created. Seeds: `["market", polymarket_market_id_hash]`. |
| `system_program` | `Program<System>` | no      | no     | Needed to create the Market PDA.                                                  |

### Procedure

> Source: `instructions/create_market.rs` — `handler()` starts at line 33

Before the handler runs, Anchor has already:

- Verified `config.admin == admin.key()` via `has_one` (line 17) → `Unauthorized` if mismatch
- Created the `Market` PDA at seeds `["market", polymarket_market_id_hash]` (line 21–28)

Then the handler runs:

```
line 1  │ fn handler(ctx, polymarket_market_id_hash, polymarket_market_id,
        │           question_hash, end_time, tick_size, yes_token_id, no_token_id) → Result<()>
line 2  │
line 3  │ CHECK: polymarket_market_id byte length <= 128
line 4  │   └─ fail → InvalidMarketId
line 5  │
line 6  │ CHECK: yes_token_id byte length <= 128 AND no_token_id byte length <= 128
line 7  │   └─ fail → InvalidMarketId
line 8  │
line 9  │ Compute sha256(polymarket_market_id) on-chain → stored in `computed`
line 10 │ CHECK: computed == polymarket_market_id_hash (the arg)
line 11 │   └─ fail → InvalidMarketId
line 12 │       This prevents the admin from accidentally passing a hash that
line 13 │       doesn't correspond to the actual market ID string.
line 14 │
line 15 │ Read the on-chain clock
line 16 │ CHECK: end_time > clock.unix_timestamp
line 17 │   └─ fail → MarketEnded
line 18 │
line 19 │ CHECK: tick_size > 0
line 20 │   └─ fail → InvalidPrice
line 21 │
line 22 │ Get mutable reference to the market account
line 23 │ Set market.polymarket_market_id = polymarket_market_id (the full string)
line 24 │ Set market.polymarket_market_id_hash = polymarket_market_id_hash (the 32-byte hash)
line 25 │ Set market.question_hash = question_hash
line 26 │ Set market.end_time = end_time
line 27 │ Set market.tick_size = tick_size
line 28 │ Set market.yes_token_id = yes_token_id
line 29 │ Set market.no_token_id = no_token_id
line 30 │ Set market.status = MarketStatus::Open
line 31 │ Set market.winning_outcome = None
line 32 │ Set market.total_yes = 0
line 33 │ Set market.total_no = 0
line 34 │ Set market.paused = false
line 35 │ Set market.bump = PDA bump
line 36 │
line 37 │ Return Ok(())
```

### Events

None.

### Errors

| Error                        | When                                                                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `Unauthorized`               | `admin` does not match `config.admin`.                                                                                                   |
| `InvalidMarketId`            | `polymarket_market_id` exceeds 128 bytes, token IDs exceed 128 bytes, or the provided hash doesn't match `sha256(polymarket_market_id)`. |
| `MarketEnded`                | `end_time` is not in the future.                                                                                                         |
| `InvalidPrice`               | `tick_size` is 0.                                                                                                                        |
| Anchor `AccountAlreadyInUse` | A market with this `polymarket_market_id_hash` PDA already exists.                                                                       |

---

## 3. `place_order`

### What it does

The core trading instruction. Executes a BUY or SELL of YES or NO shares against a signed quote issued by the backend. This is the only way users interact with the market.

**BUY**: Transfers USDC from the user to the treasury vault and credits shares to the user's position.
**SELL**: Burns shares from the user's position and transfers USDC from the treasury vault back to the user.

Every quote must be signed by the `config.quote_signer` key using ed25519. The signature is verified via the Solana Ed25519 native program — the client must include an Ed25519 verify instruction immediately before this instruction in the same transaction. Replay protection is enforced by creating a `UsedNonce` PDA for each unique nonce.

### Parameters

| Name    | Type          | Description                                                       |
| ------- | ------------- | ----------------------------------------------------------------- |
| `quote` | `SignedQuote` | The signed quote struct containing all trade details (see below). |

**SignedQuote fields:**

| Field        | Type       | Description                                                                                   |
| ------------ | ---------- | --------------------------------------------------------------------------------------------- |
| `market`     | `Pubkey`   | The Market PDA this quote applies to. Must match the `market` account passed in.              |
| `side`       | `u8`       | `0` = BUY, `1` = SELL.                                                                        |
| `outcome`    | `u8`       | `0` = YES, `1` = NO.                                                                          |
| `price`      | `u16`      | Price in cents (1–99). A price of 50 means $0.50 per share.                                   |
| `size`       | `u64`      | Number of shares. Must be > 0.                                                                |
| `expires_at` | `i64`      | Unix timestamp after which the quote is invalid. Typically `now + 5 seconds`.                 |
| `nonce`      | `[u8; 16]` | 16-byte random value for replay protection. Each nonce can only be used once across all time. |

### Accounts

| Account               | Type                     | Mutable | Signer | Why                                                                                                                                                                       |
| --------------------- | ------------------------ | ------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user`                | `Signer`                 | yes     | yes    | The trader. Pays rent for `UsedNonce` and `UserPosition` (if first trade). Signs the transaction to authorize USDC transfer (for BUY).                                    |
| `config`              | `Config` (PDA)           | no      | no     | Read to get `quote_signer` (for signature verification), `treasury_vault` address, `usdc_mint`, and `treasury_authority_bump`. Seeds: `["config"]`.                       |
| `market`              | `Market`                 | yes     | no     | The market being traded on. Writable because `total_yes`/`total_no` are updated. Ownership checked by Anchor (must be owned by this program).                             |
| `user_position`       | `UserPosition` (PDA)     | yes     | no     | Tracks the user's YES and NO share balances for this market. Created on first trade via `init_if_needed`. Seeds: `["position", user, market]`.                            |
| `used_nonce`          | `UsedNonce` (PDA)        | yes     | no     | Created with `init` — if this PDA already exists, the transaction fails (replay protection). Seeds: `["nonce", quote.nonce]`.                                             |
| `user_usdc`           | `TokenAccount`           | yes     | no     | The user's USDC token account. Constrained to `owner == user` and `mint == config.usdc_mint`. Source for BUY transfers, destination for SELL transfers.                   |
| `treasury_vault`      | `TokenAccount`           | yes     | no     | The program's USDC vault. Constrained to `address == config.treasury_vault`. Destination for BUY transfers, source for SELL transfers.                                    |
| `treasury_authority`  | `UncheckedAccount` (PDA) | no      | no     | PDA authority over the treasury vault. Used as signer for CPI transfers on SELL. Seeds: `["treasury_authority"]`. Bump verified against `config.treasury_authority_bump`. |
| `instructions_sysvar` | `UncheckedAccount`       | no      | no     | The instructions sysvar (`SysvarInstructions1111111111111111111111111`). Used to read the previous Ed25519 instruction for signature verification. Address-checked.       |
| `token_program`       | `Program<Token>`         | no      | no     | SPL Token program for USDC CPI transfers.                                                                                                                                 |
| `system_program`      | `Program<System>`        | no      | no     | Needed to create `UsedNonce` and `UserPosition` PDAs.                                                                                                                     |

### Procedure

> Source: `instructions/place_order.rs` — `handler()` starts at line 75
> Ed25519 verification sub-routine: `utils/ed25519.rs` — `verify_signed_quote()` starts at line 19

Before the handler runs, Anchor has already:

- Loaded and deserialized `config` from seeds `["config"]` (line 20–24)
- Loaded and deserialized `market` (line 26–27)
- Created or loaded `user_position` via `init_if_needed` at seeds `["position", user, market]` (line 29–36)
- Created `used_nonce` PDA at seeds `["nonce", quote.nonce]` (line 38–45) → if this PDA already exists the tx fails here with `AccountAlreadyInUse` (this IS the replay protection)
- Verified `user_usdc.owner == user` and `user_usdc.mint == config.usdc_mint` (line 47–52)
- Verified `treasury_vault` address matches `config.treasury_vault` (line 54–58)
- Verified `treasury_authority` PDA seeds and bump (line 61–65)
- Verified `instructions_sysvar` address is the instructions sysvar ID (line 68)

Then the handler runs:

```
line 1  │ fn handler(ctx, quote: SignedQuote) → Result<()>
line 2  │
line 3  │ Read the on-chain clock
line 4  │
line 5  │ ── ED25519 SIGNATURE VERIFICATION (call into verify_signed_quote) ──
line 6  │ │  Read the current instruction index from the instructions sysvar
line 7  │ │  CHECK: current_index > 0 (there must be a preceding instruction)
line 8  │ │    └─ fail → MissingSignature
line 9  │ │
line 10 │ │  Load the instruction at index (current_index - 1)
line 11 │ │    └─ fail to load → MissingSignature
line 12 │ │
line 13 │ │  CHECK: that instruction's program_id == Ed25519 native program
line 14 │ │    └─ fail → InvalidSignature
line 15 │ │
line 16 │ │  Read the instruction data bytes
line 17 │ │  CHECK: data length >= 16 bytes (2 header + 14 offsets)
line 18 │ │    └─ fail → InvalidSignature
line 19 │ │
line 20 │ │  CHECK: data[0] == 1 (exactly one signature) AND data[1] == 0 (padding)
line 21 │ │    └─ fail → InvalidSignature
line 22 │ │
line 23 │ │  Parse the offsets struct from data[2..16]:
line 24 │ │    signature_offset          = u16 LE from data[2..4]
line 25 │ │    signature_instruction_idx = u16 LE from data[4..6]
line 26 │ │    public_key_offset         = u16 LE from data[6..8]
line 27 │ │    public_key_instruction_idx= u16 LE from data[8..10]
line 28 │ │    message_data_offset       = u16 LE from data[10..12]
line 29 │ │    message_data_size         = u16 LE from data[12..14]
line 30 │ │    message_instruction_idx   = u16 LE from data[14..16]
line 31 │ │
line 32 │ │  CHECK: all three instruction indices == u16::MAX (65535)
line 33 │ │    └─ fail → InvalidSignature
line 34 │ │    This ensures sig, pubkey, and message are all embedded in the
line 35 │ │    ed25519 instruction itself and not referencing another instruction.
line 36 │ │
line 37 │ │  Compute end offsets:
line 38 │ │    pubkey_end    = public_key_offset + 32
line 39 │ │    signature_end = signature_offset + 64
line 40 │ │    message_end   = message_data_offset + message_data_size
line 41 │ │    └─ any overflow → InvalidSignature
line 42 │ │
line 43 │ │  CHECK: data length >= all three end offsets
line 44 │ │    └─ fail → InvalidSignature
line 45 │ │
line 46 │ │  Extract pubkey bytes from data[public_key_offset..pubkey_end]
line 47 │ │  CHECK: extracted pubkey == config.quote_signer
line 48 │ │    └─ fail → InvalidSignature
line 49 │ │    This is the core trust check — only quotes signed by our
line 50 │ │    backend's key are accepted.
line 51 │ │
line 52 │ │  Extract message bytes from data[message_data_offset..message_end]
line 53 │ │  Borsh-serialize the SignedQuote struct → expected_message
line 54 │ │  CHECK: extracted message == expected_message
line 55 │ │    └─ fail → InvalidSignature
line 56 │ │    This binds the ed25519 proof to THIS specific quote — an attacker
line 57 │ │    can't reuse a valid signature from a different quote.
line 58 │ │
line 59 │ │  (The Ed25519 native program already verified the cryptographic
line 60 │ │   signature before our program ran. If the sig was bad, the whole
line 61 │ │   transaction would have failed. We only need to verify WHO signed
line 62 │ │   and WHAT was signed.)
line 63 │ └────────────────────────────────────────────────────────────────────
line 64 │
line 65 │ CHECK: quote.expires_at > clock.unix_timestamp
line 66 │   └─ fail → QuoteExpired
line 67 │
line 68 │ CHECK: quote.market == market account's pubkey
line 69 │   └─ fail → MarketMismatch
line 70 │
line 71 │ CHECK: market.status == Open
line 72 │   └─ fail → MarketClosed
line 73 │
line 74 │ CHECK: market.paused == false
line 75 │   └─ fail → MarketPaused
line 76 │
line 77 │ CHECK: clock.unix_timestamp < market.end_time
line 78 │   └─ fail → MarketEnded
line 79 │
line 80 │ CHECK: quote.outcome == 0 (YES) or 1 (NO)
line 81 │   └─ fail → InvalidOutcome
line 82 │
line 83 │ CHECK: quote.side == 0 (BUY) or 1 (SELL)
line 84 │   └─ fail → InvalidSide
line 85 │
line 86 │ CHECK: quote.price > 0 AND quote.price < 100
line 87 │   └─ fail → InvalidPrice
line 88 │
line 89 │ CHECK: quote.size > 0
line 90 │   └─ fail → InvalidSize
line 91 │
line 92 │ Write the nonce into the used_nonce account (marks it as consumed)
line 93 │ Write the bump into the used_nonce account
line 94 │
line 95 │ Cache market.key() and user.key() into local variables
line 96 │ Get mutable reference to user_position
line 97 │
line 98 │ IF user_position.user == Pubkey::default (first time this user trades in this market):
line 99 │   Set user_position.user = user's pubkey
line 100│   Set user_position.market = market's pubkey
line 101│   Set user_position.bump = PDA bump
line 102│
line 103│ ── USDC AMOUNT CALCULATION ──
line 104│ usdc_amount = quote.price (cents) × 10,000 (base units per cent) × quote.size (shares)
line 105│   └─ overflow → MathOverflow
line 106│ Example: price=50, size=10 → 50 × 10,000 × 10 = 5,000,000 base units = $5.00
line 107│
line 108│ ── BRANCH ON SIDE ──
line 109│
line 110│ IF side == BUY (0):
line 111│ │  CPI: token::transfer(user_usdc → treasury_vault, usdc_amount)
line 112│ │    Authority: user (they signed the tx, so this CPI is authorized)
line 113│ │
line 114│ │  IF outcome == YES (0):
line 115│ │    user_position.yes_shares += quote.size   (checked → MathOverflow)
line 116│ │    market.total_yes += quote.size            (checked → MathOverflow)
line 117│ │  ELSE (outcome == NO):
line 118│ │    user_position.no_shares += quote.size    (checked → MathOverflow)
line 119│ │    market.total_no += quote.size             (checked → MathOverflow)
line 120│ │
line 121│ IF side == SELL (1):
line 122│ │  IF outcome == YES (0):
line 123│ │    user_position.yes_shares -= quote.size   (checked → InsufficientShares)
line 124│ │    market.total_yes -= quote.size            (checked → MathOverflow)
line 125│ │  ELSE (outcome == NO):
line 126│ │    user_position.no_shares -= quote.size    (checked → InsufficientShares)
line 127│ │    market.total_no -= quote.size             (checked → MathOverflow)
line 128│ │
line 129│ │  Build PDA signer seeds: ["treasury_authority", [bump]]
line 130│ │  CPI: token::transfer(treasury_vault → user_usdc, usdc_amount)
line 131│ │    Authority: treasury_authority PDA (program signs with seeds)
line 132│ │    The program can move USDC out of the vault because treasury_authority
line 133│ │    is the vault's owner and the program can derive the PDA signer.
line 134│
line 135│ ── EMIT EVENT ──
line 136│ Emit OrderFilled {
line 137│   user, market, polymarket_market_id (cloned from market account),
line 138│   side, outcome, size, price, nonce
line 139│ }
line 140│
line 141│ Return Ok(())
```

### Events

| Event                                                                                   | When                                                                                                                                     |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `OrderFilled { user, market, polymarket_market_id, side, outcome, size, price, nonce }` | Emitted after every successful BUY or SELL. The backend's hedging bot subscribes to this event to place offsetting orders on Polymarket. |

### Errors

| Error                        | When                                                                                                                                                                                                                                |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MissingSignature`           | No instruction exists before `place_order`, or it couldn't be loaded from the sysvar.                                                                                                                                               |
| `InvalidSignature`           | The previous instruction is not the Ed25519 program, has wrong number of signatures, wrong public key (not `config.quote_signer`), wrong message (doesn't match Borsh-serialized quote), or instruction indices are not `u16::MAX`. |
| `QuoteExpired`               | `quote.expires_at <= clock.unix_timestamp`.                                                                                                                                                                                         |
| `MarketMismatch`             | `quote.market != market.key()`.                                                                                                                                                                                                     |
| `MarketClosed`               | `market.status` is not `Open` (already resolved or cancelled).                                                                                                                                                                      |
| `MarketPaused`               | `market.paused` is true (admin activated kill switch).                                                                                                                                                                              |
| `MarketEnded`                | Current time is past `market.end_time`.                                                                                                                                                                                             |
| `InvalidOutcome`             | `quote.outcome` is not 0 or 1.                                                                                                                                                                                                      |
| `InvalidSide`                | `quote.side` is not 0 or 1.                                                                                                                                                                                                         |
| `InvalidPrice`               | `quote.price` is 0 or >= 100.                                                                                                                                                                                                       |
| `InvalidSize`                | `quote.size` is 0.                                                                                                                                                                                                                  |
| `MathOverflow`               | Arithmetic overflow in USDC calculation or share increment/decrement.                                                                                                                                                               |
| `InsufficientShares`         | SELL attempted with more shares than the user holds.                                                                                                                                                                                |
| Anchor `AccountAlreadyInUse` | The nonce has already been used (replay attempt).                                                                                                                                                                                   |

---

## 4. `resolve_market`

### What it does

Marks a market as resolved and records the winning outcome. Oracle-signer-only. After resolution, no more orders can be placed and holders of the winning shares can claim their $1-per-share payout via `claim`.

In production, the backend calls this after Polymarket resolves the corresponding market and a 48-hour dispute window passes.

### Parameters

| Name              | Type | Description                    |
| ----------------- | ---- | ------------------------------ |
| `winning_outcome` | `u8` | `0` = YES wins, `1` = NO wins. |

### Accounts

| Account         | Type           | Mutable | Signer | Why                                                                                                                                            |
| --------------- | -------------- | ------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `config`        | `Config` (PDA) | no      | no     | Read to verify `has_one = oracle_signer`. Seeds: `["config"]`.                                                                                 |
| `oracle_signer` | `Signer`       | no      | yes    | Must match `config.oracle_signer`. This is the trusted resolution authority.                                                                   |
| `market`        | `Market` (PDA) | yes     | no     | The market being resolved. Seeds: `["market", market.polymarket_market_id_hash]`. Writable because `status` and `winning_outcome` are updated. |

### Procedure

> Source: `instructions/resolve_market.rs` — `handler()` starts at line 27

Before the handler runs, Anchor has already:

- Verified `config.oracle_signer == oracle_signer.key()` via `has_one` (line 13) → `Unauthorized` if mismatch
- Verified the market PDA seeds `["market", market.polymarket_market_id_hash]` and bump (line 19–23)

Then the handler runs:

```
line 1  │ fn handler(ctx, winning_outcome: u8) → Result<()>
line 2  │
line 3  │ CHECK: winning_outcome == 0 (YES) or 1 (NO)
line 4  │   └─ fail → InvalidOutcome
line 5  │
line 6  │ Get mutable reference to the market account
line 7  │
line 8  │ CHECK: market.status == Open
line 9  │   └─ fail → MarketClosed
line 10 │       Prevents resolving a market that's already resolved or cancelled.
line 11 │
line 12 │ Set market.status = MarketStatus::Resolved
line 13 │ Set market.winning_outcome = Some(winning_outcome)
line 14 │
line 15 │ Emit MarketResolved {
line 16 │   market: market's pubkey,
line 17 │   winning_outcome
line 18 │ }
line 19 │
line 20 │ Return Ok(())
```

### Events

| Event                                        | When                                               |
| -------------------------------------------- | -------------------------------------------------- |
| `MarketResolved { market, winning_outcome }` | Emitted after the market is successfully resolved. |

### Errors

| Error            | When                                                   |
| ---------------- | ------------------------------------------------------ |
| `Unauthorized`   | `oracle_signer` does not match `config.oracle_signer`. |
| `InvalidOutcome` | `winning_outcome` is not 0 or 1.                       |
| `MarketClosed`   | Market is already resolved or cancelled.               |

---

## 5. `claim`

### What it does

Lets a user redeem their winning shares for USDC after a market has been resolved. Each winning share pays out exactly $1 (1,000,000 USDC base units). The user's winning shares are zeroed out, preventing double claims. Losing shares are not touched — they simply become worthless.

### Parameters

None. All information is derived from the accounts.

### Accounts

| Account              | Type                     | Mutable | Signer | Why                                                                                                                                                                                                  |
| -------------------- | ------------------------ | ------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user`               | `Signer`                 | yes     | yes    | The claiming user. Must match `user_position.user`.                                                                                                                                                  |
| `config`             | `Config` (PDA)           | no      | no     | Read to get `treasury_vault` address, `usdc_mint`, and `treasury_authority_bump`. Seeds: `["config"]`.                                                                                               |
| `market`             | `Market`                 | no      | no     | Read to check `status == Resolved` and get `winning_outcome`. Not writable since totals aren't updated on claim.                                                                                     |
| `user_position`      | `UserPosition` (PDA)     | yes     | no     | The user's share balances. Seeds: `["position", user, market]`. Winning shares are zeroed out. Constrained with `has_one = user` and `has_one = market` to prevent claiming someone else's position. |
| `user_usdc`          | `TokenAccount`           | yes     | no     | The user's USDC token account. Receives the payout. Constrained to `owner == user` and `mint == config.usdc_mint`.                                                                                   |
| `treasury_vault`     | `TokenAccount`           | yes     | no     | The program's USDC vault. Source of the payout. Constrained to `address == config.treasury_vault`.                                                                                                   |
| `treasury_authority` | `UncheckedAccount` (PDA) | no      | no     | PDA authority over the treasury vault. Signs the CPI transfer. Seeds: `["treasury_authority"]`. Bump verified against `config.treasury_authority_bump`.                                              |
| `token_program`      | `Program<Token>`         | no      | no     | SPL Token program for the USDC CPI transfer.                                                                                                                                                         |

### Procedure

> Source: `instructions/claim.rs` — `handler()` starts at line 57

Before the handler runs, Anchor has already:

- Verified `user_position.user == user.key()` via `has_one` (line 29)
- Verified `user_position.market == market.key()` via `has_one` (line 30)
- Verified `user_usdc.owner == user` and `user_usdc.mint == config.usdc_mint` (line 35–38)
- Verified `treasury_vault` address matches `config.treasury_vault` (line 42)
- Verified `treasury_authority` PDA seeds and bump (line 48–51)

Then the handler runs:

```
line 1  │ fn handler(ctx) → Result<()>
line 2  │
line 3  │ Read the market account (immutable reference — market is not writable)
line 4  │
line 5  │ CHECK: market.status == Resolved
line 6  │   └─ fail → MarketNotResolved
line 7  │
line 8  │ Read market.winning_outcome → unwrap the Option<u8>
line 9  │   └─ if None → MarketNotResolved (should never happen if status is Resolved)
line 10 │
line 11 │ Get mutable reference to user_position
line 12 │
line 13 │ ── DETERMINE WINNING SHARES ──
line 14 │
line 15 │ IF winning_outcome == YES (0):
line 16 │   Read user_position.yes_shares → save as `shares`
line 17 │   Set user_position.yes_shares = 0
line 18 │       (zeroing prevents double-claim — the shares are "burned")
line 19 │
line 20 │ IF winning_outcome == NO (1):
line 21 │   Read user_position.no_shares → save as `shares`
line 22 │   Set user_position.no_shares = 0
line 23 │
line 24 │ (any other value → InvalidOutcome, but this can't happen because
line 25 │  resolve_market already validated winning_outcome as 0 or 1)
line 26 │
line 27 │ CHECK: shares > 0
line 28 │   └─ fail → NoWinningShares
line 29 │       Covers: user never bought winning shares, or already claimed.
line 30 │
line 31 │ ── PAYOUT CALCULATION ──
line 32 │
line 33 │ payout = shares × 1,000,000 (USDC base units, i.e. $1 per share)
line 34 │   └─ overflow → MathOverflow
line 35 │ Example: 10 shares → 10 × 1,000,000 = 10,000,000 base units = $10.00
line 36 │
line 37 │ ── CPI TRANSFER ──
line 38 │
line 39 │ Build PDA signer seeds: ["treasury_authority", [bump]]
line 40 │ CPI: token::transfer(treasury_vault → user_usdc, payout)
line 41 │   Authority: treasury_authority PDA (program signs with seeds)
line 42 │
line 43 │ ── EMIT EVENT ──
line 44 │
line 45 │ Emit Claimed {
line 46 │   user: user's pubkey,
line 47 │   market: market's pubkey,
line 48 │   outcome: winning_outcome,
line 49 │   shares: number of shares redeemed,
line 50 │   payout: USDC base units transferred
line 51 │ }
line 52 │
line 53 │ Return Ok(())
```

### Events

| Event                                               | When                                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------ |
| `Claimed { user, market, outcome, shares, payout }` | Emitted after a successful claim. `payout` is in USDC base units (6 decimals). |

### Errors

| Error               | When                                                                   |
| ------------------- | ---------------------------------------------------------------------- |
| `MarketNotResolved` | Market status is not `Resolved`, or `winning_outcome` is `None`.       |
| `NoWinningShares`   | User has 0 winning shares (never bought them, or already claimed).     |
| `MathOverflow`      | Payout calculation overflows (extremely large share count).            |
| `Unauthorized`      | `user_position.user != user.key()` or `user_usdc.owner != user.key()`. |
| `MarketMismatch`    | `user_position.market != market.key()`.                                |

---

## 6. `admin_pause_market`

### What it does

Emergency kill switch. Sets `market.paused = true`, which causes all subsequent `place_order` calls on this market to fail with `MarketPaused`. Does not affect `resolve_market` or `claim` — resolution and payouts continue to work on paused markets.

Used when: the hedging bot fails, unhedged delta exceeds the cap, or any operational emergency requires halting trading.

### Parameters

None.

### Accounts

| Account  | Type           | Mutable | Signer | Why                                                                                                                   |
| -------- | -------------- | ------- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| `config` | `Config` (PDA) | no      | no     | Read to verify `has_one = admin`. Seeds: `["config"]`.                                                                |
| `admin`  | `Signer`       | no      | yes    | Must match `config.admin`. Only the admin can pause.                                                                  |
| `market` | `Market` (PDA) | yes     | no     | The market being paused. Seeds: `["market", market.polymarket_market_id_hash]`. Writable because `paused` is updated. |

### Procedure

> Source: `instructions/admin.rs` — `pause_handler()` starts at line 26

Before the handler runs, Anchor has already:

- Verified `config.admin == admin.key()` via `has_one` (line 12) → `Unauthorized` if mismatch
- Verified market PDA seeds `["market", market.polymarket_market_id_hash]` and bump (line 19–22)

Then the handler runs:

```
line 1  │ fn pause_handler(ctx) → Result<()>
line 2  │
line 3  │ Set market.paused = true
line 4  │
line 5  │ Return Ok(())
```

One line of logic. All security is in the Anchor account constraints.

### Events

None.

### Errors

| Error          | When                                   |
| -------------- | -------------------------------------- |
| `Unauthorized` | `admin` does not match `config.admin`. |

---

## 7. `admin_unpause_market`

### What it does

Reverses a pause. Sets `market.paused = false`, re-enabling `place_order` calls on this market. Uses the same account struct as `admin_pause_market`.

### Parameters

None.

### Accounts

Same as `admin_pause_market`.

### Procedure

> Source: `instructions/admin.rs` — `unpause_handler()` starts at line 31

Before the handler runs, Anchor performs the same checks as `admin_pause_market` (admin ownership, market PDA verification).

Then the handler runs:

```
line 1  │ fn unpause_handler(ctx) → Result<()>
line 2  │
line 3  │ Set market.paused = false
line 4  │
line 5  │ Return Ok(())
```

### Events

None.

### Errors

| Error          | When                                   |
| -------------- | -------------------------------------- |
| `Unauthorized` | `admin` does not match `config.admin`. |
