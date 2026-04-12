# SolMarket Contract — Instruction Reference

Program ID: `6phzgYZv5a2k7iNKcoSjS9SaP8dzybtkVHjhcfHxWSL7`

This document describes every instruction in the SolMarket Anchor program. For each instruction you'll find what it does, what it takes in, every account with its purpose, the exact execution flow, events emitted, and every possible error.

---

## 1. `initialize_config`

### What it does

One-time bootstrap that creates the global `Config` PDA and the program's shared USDC treasury vault. After this instruction lands, the program is ready to create markets and accept orders. Can only be called once — a second call fails because the Config PDA already exists.

### Parameters

| Name | Type | Description |
|------|------|-------------|
| `oracle_signer` | `Pubkey` | Public key authorized to resolve markets. Stored in Config so `resolve_market` can verify the caller. |
| `quote_signer` | `Pubkey` | Public key whose ed25519 signature is required on every `place_order` quote. This is the backend's signing key. |

### Accounts

| Account | Type | Mutable | Signer | Why |
|---------|------|---------|--------|-----|
| `admin` | `Signer` | yes | yes | Pays for account creation rent. Stored as `config.admin` — only this key can create markets and pause/unpause. |
| `config` | `Config` (PDA) | yes | no | The global config account being created. Seeds: `["config"]`. Stores admin, oracle_signer, quote_signer, treasury addresses, and bumps. |
| `treasury_authority` | `UncheckedAccount` (PDA) | no | no | PDA that owns the treasury vault token account. Seeds: `["treasury_authority"]`. The program uses this PDA to sign CPI transfers out of the vault (for sells and claims). Not writable because it holds no data — it's purely a signing authority. |
| `treasury_vault` | `TokenAccount` (PDA) | yes | no | The USDC token account being created. Seeds: `["treasury_vault"]`. Holds all USDC deposited by buyers. Authority is set to `treasury_authority` so the program can transfer out via PDA signing. |
| `usdc_mint` | `Mint` | no | no | The SPL token mint for USDC. Stored in Config so subsequent instructions can verify users pass the correct mint. |
| `token_program` | `Program<Token>` | no | no | SPL Token program — needed to create the treasury vault token account. |
| `system_program` | `Program<System>` | no | no | Needed to create the Config and treasury vault PDAs. |
| `rent` | `Sysvar<Rent>` | no | no | Needed for token account initialization rent calculation. |

### Execution flow

1. Anchor creates the `Config` PDA at seeds `["config"]` and the `treasury_vault` token account PDA at seeds `["treasury_vault"]`, both paid by `admin`.
2. The treasury vault is initialized with `mint = usdc_mint` and `authority = treasury_authority`.
3. The handler writes all fields into Config:
   - `config.admin` = the signing admin's pubkey
   - `config.oracle_signer` = the provided oracle_signer pubkey
   - `config.quote_signer` = the provided quote_signer pubkey
   - `config.treasury_vault` = the treasury vault's address
   - `config.usdc_mint` = the USDC mint's address
   - `config.treasury_authority_bump`, `config.treasury_vault_bump`, `config.bump` = PDA bumps for future re-derivation

### Events

None.

### Errors

| Error | When |
|-------|------|
| Anchor `AccountAlreadyInUse` | Config PDA already exists (second initialization attempt). |

---

## 2. `create_market`

### What it does

Creates a new prediction market linked to a Polymarket market. Admin-only. Each market is a PDA derived from the SHA-256 hash of the Polymarket market ID, so the same Polymarket market can only be listed once.

### Parameters

| Name | Type | Description |
|------|------|-------------|
| `polymarket_market_id_hash` | `[u8; 32]` | SHA-256 hash of `polymarket_market_id`. Used as the PDA seed. The program recomputes the hash on-chain and rejects if it doesn't match (prevents accidental misuse). |
| `polymarket_market_id` | `String` | The full Polymarket condition ID string (max 128 bytes). Stored in the Market account for event emission and backend lookups. |
| `question_hash` | `[u8; 32]` | SHA-256 hash of the market question text. Stored for frontend/indexer reference. |
| `end_time` | `i64` | Unix timestamp after which the market stops accepting orders. Must be in the future. |
| `tick_size` | `u16` | Minimum price increment (in cents). Must be > 0. Stored for the backend's quote engine. |
| `yes_token_id` | `String` | Polymarket's conditional token ID for the YES outcome (max 128 bytes). |
| `no_token_id` | `String` | Polymarket's conditional token ID for the NO outcome (max 128 bytes). |

### Accounts

| Account | Type | Mutable | Signer | Why |
|---------|------|---------|--------|-----|
| `admin` | `Signer` | yes | yes | Must match `config.admin`. Pays rent for the new Market PDA. |
| `config` | `Config` (PDA) | no | no | Read to verify `has_one = admin`. Seeds: `["config"]`. |
| `market` | `Market` (PDA) | yes | no | The market account being created. Seeds: `["market", polymarket_market_id_hash]`. |
| `system_program` | `Program<System>` | no | no | Needed to create the Market PDA. |

### Execution flow

1. Anchor verifies `config.admin == admin.key()` via `has_one`. If not, throws `Unauthorized`.
2. Validates `polymarket_market_id` length <= 128 bytes, `yes_token_id` and `no_token_id` lengths <= 128 bytes. If any exceed, throws `InvalidMarketId`.
3. Computes `sha256(polymarket_market_id)` on-chain and compares with the provided `polymarket_market_id_hash`. If mismatch, throws `InvalidMarketId`.
4. Reads the clock. Validates `end_time > clock.unix_timestamp`. If not, throws `MarketEnded`.
5. Validates `tick_size > 0`. If not, throws `InvalidPrice`.
6. Anchor creates the Market PDA at seeds `["market", polymarket_market_id_hash]`.
7. Writes all fields into the Market account:
   - `polymarket_market_id`, `polymarket_market_id_hash`, `question_hash` — as provided
   - `end_time`, `tick_size`, `yes_token_id`, `no_token_id` — as provided
   - `status` = `Open`
   - `winning_outcome` = `None`
   - `total_yes` = 0, `total_no` = 0
   - `paused` = false
   - `bump` = the PDA bump

### Events

None.

### Errors

| Error | When |
|-------|------|
| `Unauthorized` | `admin` does not match `config.admin`. |
| `InvalidMarketId` | `polymarket_market_id` exceeds 128 bytes, token IDs exceed 128 bytes, or the provided hash doesn't match `sha256(polymarket_market_id)`. |
| `MarketEnded` | `end_time` is not in the future. |
| `InvalidPrice` | `tick_size` is 0. |
| Anchor `AccountAlreadyInUse` | A market with this `polymarket_market_id_hash` PDA already exists. |

---

## 3. `place_order`

### What it does

The core trading instruction. Executes a BUY or SELL of YES or NO shares against a signed quote issued by the backend. This is the only way users interact with the market.

**BUY**: Transfers USDC from the user to the treasury vault and credits shares to the user's position.
**SELL**: Burns shares from the user's position and transfers USDC from the treasury vault back to the user.

Every quote must be signed by the `config.quote_signer` key using ed25519. The signature is verified via the Solana Ed25519 native program — the client must include an Ed25519 verify instruction immediately before this instruction in the same transaction. Replay protection is enforced by creating a `UsedNonce` PDA for each unique nonce.

### Parameters

| Name | Type | Description |
|------|------|-------------|
| `quote` | `SignedQuote` | The signed quote struct containing all trade details (see below). |

**SignedQuote fields:**

| Field | Type | Description |
|-------|------|-------------|
| `market` | `Pubkey` | The Market PDA this quote applies to. Must match the `market` account passed in. |
| `side` | `u8` | `0` = BUY, `1` = SELL. |
| `outcome` | `u8` | `0` = YES, `1` = NO. |
| `price` | `u16` | Price in cents (1–99). A price of 50 means $0.50 per share. |
| `size` | `u64` | Number of shares. Must be > 0. |
| `expires_at` | `i64` | Unix timestamp after which the quote is invalid. Typically `now + 5 seconds`. |
| `nonce` | `[u8; 16]` | 16-byte random value for replay protection. Each nonce can only be used once across all time. |

### Accounts

| Account | Type | Mutable | Signer | Why |
|---------|------|---------|--------|-----|
| `user` | `Signer` | yes | yes | The trader. Pays rent for `UsedNonce` and `UserPosition` (if first trade). Signs the transaction to authorize USDC transfer (for BUY). |
| `config` | `Config` (PDA) | no | no | Read to get `quote_signer` (for signature verification), `treasury_vault` address, `usdc_mint`, and `treasury_authority_bump`. Seeds: `["config"]`. |
| `market` | `Market` | yes | no | The market being traded on. Writable because `total_yes`/`total_no` are updated. Ownership checked by Anchor (must be owned by this program). |
| `user_position` | `UserPosition` (PDA) | yes | no | Tracks the user's YES and NO share balances for this market. Created on first trade via `init_if_needed`. Seeds: `["position", user, market]`. |
| `used_nonce` | `UsedNonce` (PDA) | yes | no | Created with `init` — if this PDA already exists, the transaction fails (replay protection). Seeds: `["nonce", quote.nonce]`. |
| `user_usdc` | `TokenAccount` | yes | no | The user's USDC token account. Constrained to `owner == user` and `mint == config.usdc_mint`. Source for BUY transfers, destination for SELL transfers. |
| `treasury_vault` | `TokenAccount` | yes | no | The program's USDC vault. Constrained to `address == config.treasury_vault`. Destination for BUY transfers, source for SELL transfers. |
| `treasury_authority` | `UncheckedAccount` (PDA) | no | no | PDA authority over the treasury vault. Used as signer for CPI transfers on SELL. Seeds: `["treasury_authority"]`. Bump verified against `config.treasury_authority_bump`. |
| `instructions_sysvar` | `UncheckedAccount` | no | no | The instructions sysvar (`SysvarInstructions1111111111111111111111111`). Used to read the previous Ed25519 instruction for signature verification. Address-checked. |
| `token_program` | `Program<Token>` | no | no | SPL Token program for USDC CPI transfers. |
| `system_program` | `Program<System>` | no | no | Needed to create `UsedNonce` and `UserPosition` PDAs. |

### Execution flow

1. **Ed25519 signature verification**: Reads the instructions sysvar to find the instruction immediately before this one. Verifies:
   - The previous instruction targets the Ed25519 native program (`Ed25519SigVerify111111111111111111111111111`).
   - Exactly 1 signature is present.
   - All instruction indices are `u16::MAX` (signature, pubkey, message all embedded in that instruction).
   - The public key in the ed25519 instruction equals `config.quote_signer`.
   - The message in the ed25519 instruction equals the Borsh serialization of the `SignedQuote` struct.
   - If any check fails → `InvalidSignature` or `MissingSignature`.

2. **Quote expiry check**: `quote.expires_at > clock.unix_timestamp`. If not → `QuoteExpired`.

3. **Market match check**: `quote.market == market.key()`. If not → `MarketMismatch`.

4. **Market status check**: `market.status == Open`. If not → `MarketClosed`.

5. **Pause check**: `market.paused == false`. If paused → `MarketPaused`.

6. **End time check**: `clock.unix_timestamp < market.end_time`. If past → `MarketEnded`.

7. **Input validation**:
   - `quote.outcome` must be 0 or 1 → `InvalidOutcome`
   - `quote.side` must be 0 or 1 → `InvalidSide`
   - `quote.price` must be 1–99 inclusive → `InvalidPrice`
   - `quote.size` must be > 0 → `InvalidSize`

8. **Nonce consumption**: Anchor creates the `UsedNonce` PDA (fails with `AccountAlreadyInUse` if nonce was already used — this IS the replay protection). Writes `nonce` and `bump` into it.

9. **Position initialization**: If `user_position.user == Pubkey::default()` (first trade for this user in this market), initializes the position with `user`, `market`, and `bump`.

10. **USDC amount calculation**: `usdc_amount = price * 10_000 * size`. (Price in cents × 10,000 base units per cent × number of shares.) Uses checked math → `MathOverflow` on overflow.

11. **BUY path** (side == 0):
    - CPI `token::transfer` of `usdc_amount` from `user_usdc` to `treasury_vault`, authorized by `user`.
    - If outcome == YES: increment `user_position.yes_shares` and `market.total_yes` by `size`.
    - If outcome == NO: increment `user_position.no_shares` and `market.total_no` by `size`.
    - Checked math on all increments → `MathOverflow`.

12. **SELL path** (side == 1):
    - If outcome == YES: decrement `user_position.yes_shares` and `market.total_yes` by `size`. If insufficient → `InsufficientShares`.
    - If outcome == NO: decrement `user_position.no_shares` and `market.total_no` by `size`. If insufficient → `InsufficientShares`.
    - CPI `token::transfer` of `usdc_amount` from `treasury_vault` to `user_usdc`, signed by `treasury_authority` PDA.

13. **Emit event**: `OrderFilled` with all trade details.

### Events

| Event | When |
|-------|------|
| `OrderFilled { user, market, polymarket_market_id, side, outcome, size, price, nonce }` | Emitted after every successful BUY or SELL. The backend's hedging bot subscribes to this event to place offsetting orders on Polymarket. |

### Errors

| Error | When |
|-------|------|
| `MissingSignature` | No instruction exists before `place_order`, or it couldn't be loaded from the sysvar. |
| `InvalidSignature` | The previous instruction is not the Ed25519 program, has wrong number of signatures, wrong public key (not `config.quote_signer`), wrong message (doesn't match Borsh-serialized quote), or instruction indices are not `u16::MAX`. |
| `QuoteExpired` | `quote.expires_at <= clock.unix_timestamp`. |
| `MarketMismatch` | `quote.market != market.key()`. |
| `MarketClosed` | `market.status` is not `Open` (already resolved or cancelled). |
| `MarketPaused` | `market.paused` is true (admin activated kill switch). |
| `MarketEnded` | Current time is past `market.end_time`. |
| `InvalidOutcome` | `quote.outcome` is not 0 or 1. |
| `InvalidSide` | `quote.side` is not 0 or 1. |
| `InvalidPrice` | `quote.price` is 0 or >= 100. |
| `InvalidSize` | `quote.size` is 0. |
| `MathOverflow` | Arithmetic overflow in USDC calculation or share increment/decrement. |
| `InsufficientShares` | SELL attempted with more shares than the user holds. |
| Anchor `AccountAlreadyInUse` | The nonce has already been used (replay attempt). |

---

## 4. `resolve_market`

### What it does

Marks a market as resolved and records the winning outcome. Oracle-signer-only. After resolution, no more orders can be placed and holders of the winning shares can claim their $1-per-share payout via `claim`.

In production, the backend calls this after Polymarket resolves the corresponding market and a 48-hour dispute window passes.

### Parameters

| Name | Type | Description |
|------|------|-------------|
| `winning_outcome` | `u8` | `0` = YES wins, `1` = NO wins. |

### Accounts

| Account | Type | Mutable | Signer | Why |
|---------|------|---------|--------|-----|
| `config` | `Config` (PDA) | no | no | Read to verify `has_one = oracle_signer`. Seeds: `["config"]`. |
| `oracle_signer` | `Signer` | no | yes | Must match `config.oracle_signer`. This is the trusted resolution authority. |
| `market` | `Market` (PDA) | yes | no | The market being resolved. Seeds: `["market", market.polymarket_market_id_hash]`. Writable because `status` and `winning_outcome` are updated. |

### Execution flow

1. Anchor verifies `config.oracle_signer == oracle_signer.key()` via `has_one`. If not → `Unauthorized`.
2. Validates `winning_outcome` is 0 or 1. If not → `InvalidOutcome`.
3. Checks `market.status == Open`. If not → `MarketClosed` (prevents double resolution).
4. Sets `market.status = Resolved`.
5. Sets `market.winning_outcome = Some(winning_outcome)`.
6. Emits `MarketResolved` event.

### Events

| Event | When |
|-------|------|
| `MarketResolved { market, winning_outcome }` | Emitted after the market is successfully resolved. |

### Errors

| Error | When |
|-------|------|
| `Unauthorized` | `oracle_signer` does not match `config.oracle_signer`. |
| `InvalidOutcome` | `winning_outcome` is not 0 or 1. |
| `MarketClosed` | Market is already resolved or cancelled. |

---

## 5. `claim`

### What it does

Lets a user redeem their winning shares for USDC after a market has been resolved. Each winning share pays out exactly $1 (1,000,000 USDC base units). The user's winning shares are zeroed out, preventing double claims. Losing shares are not touched — they simply become worthless.

### Parameters

None. All information is derived from the accounts.

### Accounts

| Account | Type | Mutable | Signer | Why |
|---------|------|---------|--------|-----|
| `user` | `Signer` | yes | yes | The claiming user. Must match `user_position.user`. |
| `config` | `Config` (PDA) | no | no | Read to get `treasury_vault` address, `usdc_mint`, and `treasury_authority_bump`. Seeds: `["config"]`. |
| `market` | `Market` | no | no | Read to check `status == Resolved` and get `winning_outcome`. Not writable since totals aren't updated on claim. |
| `user_position` | `UserPosition` (PDA) | yes | no | The user's share balances. Seeds: `["position", user, market]`. Winning shares are zeroed out. Constrained with `has_one = user` and `has_one = market` to prevent claiming someone else's position. |
| `user_usdc` | `TokenAccount` | yes | no | The user's USDC token account. Receives the payout. Constrained to `owner == user` and `mint == config.usdc_mint`. |
| `treasury_vault` | `TokenAccount` | yes | no | The program's USDC vault. Source of the payout. Constrained to `address == config.treasury_vault`. |
| `treasury_authority` | `UncheckedAccount` (PDA) | no | no | PDA authority over the treasury vault. Signs the CPI transfer. Seeds: `["treasury_authority"]`. Bump verified against `config.treasury_authority_bump`. |
| `token_program` | `Program<Token>` | no | no | SPL Token program for the USDC CPI transfer. |

### Execution flow

1. Checks `market.status == Resolved`. If not → `MarketNotResolved`.
2. Reads `market.winning_outcome`. If `None` → `MarketNotResolved`.
3. Reads the user's winning shares based on the outcome:
   - If YES won (outcome 0): reads `user_position.yes_shares`, then sets it to 0.
   - If NO won (outcome 1): reads `user_position.no_shares`, then sets it to 0.
4. Checks `shares > 0`. If not → `NoWinningShares`.
5. Calculates payout: `shares * 1,000,000` (USDC base units). Uses checked math → `MathOverflow`.
6. CPI `token::transfer` of `payout` from `treasury_vault` to `user_usdc`, signed by `treasury_authority` PDA.
7. Emits `Claimed` event.

### Events

| Event | When |
|-------|------|
| `Claimed { user, market, outcome, shares, payout }` | Emitted after a successful claim. `payout` is in USDC base units (6 decimals). |

### Errors

| Error | When |
|-------|------|
| `MarketNotResolved` | Market status is not `Resolved`, or `winning_outcome` is `None`. |
| `NoWinningShares` | User has 0 winning shares (never bought them, or already claimed). |
| `MathOverflow` | Payout calculation overflows (extremely large share count). |
| `Unauthorized` | `user_position.user != user.key()` or `user_usdc.owner != user.key()`. |
| `MarketMismatch` | `user_position.market != market.key()`. |

---

## 6. `admin_pause_market`

### What it does

Emergency kill switch. Sets `market.paused = true`, which causes all subsequent `place_order` calls on this market to fail with `MarketPaused`. Does not affect `resolve_market` or `claim` — resolution and payouts continue to work on paused markets.

Used when: the hedging bot fails, unhedged delta exceeds the cap, or any operational emergency requires halting trading.

### Parameters

None.

### Accounts

| Account | Type | Mutable | Signer | Why |
|---------|------|---------|--------|-----|
| `config` | `Config` (PDA) | no | no | Read to verify `has_one = admin`. Seeds: `["config"]`. |
| `admin` | `Signer` | no | yes | Must match `config.admin`. Only the admin can pause. |
| `market` | `Market` (PDA) | yes | no | The market being paused. Seeds: `["market", market.polymarket_market_id_hash]`. Writable because `paused` is updated. |

### Execution flow

1. Anchor verifies `config.admin == admin.key()` via `has_one`. If not → `Unauthorized`.
2. Sets `market.paused = true`.

### Events

None.

### Errors

| Error | When |
|-------|------|
| `Unauthorized` | `admin` does not match `config.admin`. |

---

## 7. `admin_unpause_market`

### What it does

Reverses a pause. Sets `market.paused = false`, re-enabling `place_order` calls on this market. Uses the same account struct as `admin_pause_market`.

### Parameters

None.

### Accounts

Same as `admin_pause_market`.

### Execution flow

1. Anchor verifies `config.admin == admin.key()` via `has_one`. If not → `Unauthorized`.
2. Sets `market.paused = false`.

### Events

None.

### Errors

| Error | When |
|-------|------|
| `Unauthorized` | `admin` does not match `config.admin`. |
