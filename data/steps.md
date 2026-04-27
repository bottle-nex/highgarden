# SolMarket | Step-by-Step Build Plan

> Source material: [brainstorming.md](brainstorming.md), [use-case.md](use-case.md), [noob.md](noob.md).
> Goal: Ship a hackathon MVP of a Solana prediction market that mirrors Polymarket's order book and hedges every user trade back to Polymarket at a spread.
> Team size: **3 engineers**. Repo is already scaffolded as a Turborepo monorepo with `apps/server`, `apps/web`, `packages/database`.

---

## 0. What we are building (one paragraph)

A Solana-native prediction market UI ("SolMarket") that looks liquid from day one by:

1. Reading Polymarket's live CLOB and showing those quotes (plus a spread) to Solana users.
2. Accepting Solana trades against a **signed quote** issued by our backend.
3. Immediately hedging every filled Solana trade by placing the offsetting order on Polymarket via `@polymarket/clob-client`.
4. Tracking unhedged delta per market and refusing new quotes when a cap is breached.
5. Bridging an outcome from Polymarket's resolution back to Solana so users can claim payouts.

Profit = the spread. Risk = cross-chain execution latency. Safety valve = unhedged-delta cap + kill switch.

---

## 1. Components we have to build

These map 1:1 to the "we build ourselves" table in [brainstorming.md](brainstorming.md) and the "must build" list at the bottom of [use-case.md](use-case.md).

| #   | Component                                                      | Tech                    | Owner track            |
| --- | -------------------------------------------------------------- | ----------------------- | ---------------------- |
| C1  | Solana on-chain program                                        | Anchor (Rust)           | Track A                |
| C2  | Mirror service (pulls Polymarket book)                         | Bun/TS in `apps/server` | Track B                |
| C3  | Signed-quote endpoint                                          | Bun/TS in `apps/server` | Track B                |
| C4  | Hedging bot (places offsetting orders on Polymarket)           | Bun/TS in `apps/server` | Track B                |
| C5  | Unhedged-delta tracker + kill switch                           | Bun/TS in `apps/server` | Track B                |
| C6  | Resolution oracle signer                                       | Bun/TS in `apps/server` | Track B                |
| C7  | Balance monitors + alerts                                      | Bun/TS in `apps/server` | Track B                |
| C8  | Prisma schema for markets / fills / exposure / nonces          | `packages/database`     | Shared, Track B drives |
| C9  | Next.js frontend (markets list, trade panel, claim, positions) | `apps/web`              | Track C                |
| C10 | Wallet connect + Solana tx building on the client              | `apps/web`              | Track C                |
| C11 | Treasury + bridge ops (manual scripts for MVP)                 | scripts/                | Track B                |

Three tracks:

- **Track A — Chain:** Anchor program end-to-end.
- **Track B — Backend:** mirror + quote + hedger + oracle + DB + ops.
- **Track C — Frontend:** Next.js UI, wallet flows, tx building.

---

## 2. Phase 0 — Shared setup (everyone, day 1, before splitting)

These must land before the three tracks can move in parallel.

### 2.1. Lock the interfaces first (the contract between tracks)

Write a single `packages/shared` (or `packages/contracts`) TS package that exports the **types** everyone depends on. This is the hinge of parallel work.

- `SignedQuote` shape: `{ marketId, side: "BUY"|"SELL", outcome: "YES"|"NO", price: number, size: number, expiresAt: number, nonce: string, signature: string }`.
- `MarketDTO` shape returned by `/markets` and `/markets/:id`.
- `OrderFilledEvent` shape emitted by the Solana program (must match Anchor `#[event]`).
- REST endpoint contracts: `POST /quote`, `GET /markets`, `GET /markets/:id/book`, `GET /positions/:wallet`.
- Error codes: `QUOTE_EXPIRED`, `OUT_OF_CAPACITY`, `NONCE_USED`, `SIG_INVALID`, `MARKET_CLOSED`.

**Deliverable:** merged PR that adds `packages/shared` with all of the above as TS types and zod schemas.

### 2.2. Decide configuration constants (write them down in `packages/shared/config.ts`)

- Spread: `1 cent` each side (0.01 USDC) — MVP constant.
- Quote expiry: `5s`.
- Unhedged-delta cap per market: `$500`.
- Max slippage when walking Polymarket book: `2¢`.
- Hedge retry: `3 attempts, exponential backoff, base 500ms`.
- Oracle finalization delay: `48h` after Polymarket resolves.
- Treasury top-up alert thresholds: `$500` on each chain.

### 2.3. Prisma schema (C8)

Add tables in [packages/database/prisma/schema.prisma](packages/database/prisma/schema.prisma):

- `Market` — `id`, `polymarketMarketId`, `yesTokenId`, `noTokenId`, `question`, `endTime`, `tickSize`, `negRisk`, `solanaMarketPda`, `status`.
- `Quote` — `nonce` (PK), `marketId`, `side`, `outcome`, `price`, `size`, `expiresAt`, `signature`, `consumed` (bool).
- `Fill` — `id`, `marketId`, `user` (Solana pubkey), `side`, `outcome`, `size`, `price`, `solanaTxSig`, `createdAt`.
- `Hedge` — `id`, `fillId` (FK), `polymarketOrderId`, `status` (PENDING|FILLED|PARTIAL|FAILED), `filledSize`, `avgPrice`, `attempts`, `lastError`.
- `Exposure` — `marketId` (PK), `unhedgedUsd`, `updatedAt`.
- `PolymarketBookSnapshot` — `marketId`, `side`, `price`, `size`, `ts` (for the mirror's latest best bid/ask cache, optional — can live in memory).
- `TreasuryBalance` — `chain`, `token`, `amount`, `updatedAt`.

Run `bun x prisma migrate dev` and commit the migration.

### 2.4. Environment variables — agree on names now, write to [.env.example](.env.example)

```
# Solana
SOLANA_RPC_URL=
SOLANA_PROGRAM_ID=
SOLANA_ORACLE_SIGNER_KEYPAIR=    # base58 secret key
SOLANA_QUOTE_SIGNER_KEYPAIR=
SOLANA_TREASURY_PDA=

# Polymarket
POLYMARKET_API_BASE=https://clob.polymarket.com
POLYMARKET_WS_URL=wss://clob.polymarket.com
POLYMARKET_PRIVATE_KEY=           # Polygon wallet private key
POLYMARKET_FUNDER_ADDRESS=
POLYMARKET_API_KEY=
POLYMARKET_API_SECRET=
POLYMARKET_API_PASSPHRASE=

# App
DATABASE_URL=
BACKEND_URL=http://localhost:3001
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
NEXT_PUBLIC_SOLANA_RPC_URL=
NEXT_PUBLIC_PROGRAM_ID=
```

### 2.5. Fund wallets

- Devnet SOL on the Solana signer keypairs.
- Devnet USDC on Solana treasury PDA ($5k equivalent).
- Real USDC on Polygon in the Polymarket funder wallet ($5k equivalent). (For hackathon demo, we can run against Polymarket mainnet with small size, or a Polymarket staging environment if one exists — **verify this before committing funds**.)
- Generate Polymarket API creds via `createOrDeriveApiKey()` one-time script.

### 2.6. CI guardrails

- `bun run typecheck` across the monorepo.
- `cargo build` for the Anchor program.
- Lint, prettier, tests all wired to GitHub Actions. (Optional for hackathon but saves pain.)

**Checkpoint:** Once 2.1–2.5 are done, the three tracks fork.

---

## 3. Track A — Solana program (Anchor) — C1

Owner: one engineer. Lives in `apps/program/` or `programs/solmarket/` (new). Uses Anchor.

### 3.1. Scaffold

- `anchor init solmarket` inside `apps/program`.
- Configure to build against devnet. Set `declare_id!` after first build.

### 3.2. Accounts

- `Config` (PDA, seed `"config"`): stores `admin`, `oracle_signer_pubkey`, `quote_signer_pubkey`, `treasury_vault`.
- `Market` (PDA, seed `"market" + polymarket_market_id_hash`): stores `polymarket_market_id`, `question_hash`, `end_time`, `tick_size`, `yes_token_id`, `no_token_id`, `status: Open|Resolved|Cancelled`, `winning_outcome?`, `total_yes`, `total_no`.
- `UserPosition` (PDA, seed `"position" + user + market`): stores `yes_shares`, `no_shares`.
- `UsedNonce` (PDA, seed `"nonce" + hash(nonce)`): empty marker account that exists iff nonce has been consumed.
- `TreasuryVault`: single USDC token account owned by a treasury PDA (cross-market, as decided in use-case Case F).

### 3.3. Instructions

1. **`initialize_config(admin, oracle_signer, quote_signer)`** — once.
2. **`create_market(polymarket_market_id, question, end_time, tick_size, yes_token_id, no_token_id)`** — admin only.
3. **`place_order(signed_quote, quote_sig)`** — the heart of the program:
   - Verify `quote_sig` against `config.quote_signer_pubkey` using `ed25519_program` sysvar (CPI to the Ed25519SigVerify native program; **this is the standard Solana pattern — do not reimplement ed25519**).
   - Check `expires_at > clock.unix_timestamp`, else `QuoteExpired`.
   - Create `UsedNonce` PDA for this nonce, else `NonceUsed` (replay protection — use `init` so it fails if already initialized).
   - Check `market.status == Open`, else `MarketClosed`.
   - If `side == BUY`: transfer `price * size` USDC user → treasury vault, mint `size` shares to `UserPosition` for the chosen outcome, increment `market.total_{yes,no}`.
   - If `side == SELL`: burn `size` shares from `UserPosition`, transfer `price * size` USDC treasury vault → user. Fail if position is short.
   - Emit `OrderFilled` event with all the fields in `packages/shared`.
4. **`resolve_market(winning_outcome)`** — oracle signer only. Sets `market.status = Resolved`.
5. **`claim(market, outcome)`** — any user holding winning shares:
   - Must be `Resolved` and `winning_outcome == outcome`.
   - Burn shares in `UserPosition`, transfer `$1 * shares` USDC treasury → user.
6. **`admin_pause_market(market)`** / **`admin_unpause_market(market)`** — emergency kill switch.

### 3.4. Events

```rust
#[event]
pub struct OrderFilled {
    pub user: Pubkey,
    pub market: Pubkey,
    pub polymarket_market_id: String,
    pub side: u8,      // 0 = BUY, 1 = SELL
    pub outcome: u8,   // 0 = YES, 1 = NO
    pub size: u64,     // whole shares
    pub price: u16,    // cents, 0..100
    pub nonce: [u8; 16],
}
```

Must stay byte-identical to the TS decoder in Track B.

### 3.5. Tests (Anchor Mocha)

- Happy path: create market → place BUY → position updated → event emitted.
- Expired quote rejected.
- Reused nonce rejected.
- Bad signature rejected.
- SELL fails when position insufficient.
- Resolve + claim happy path (YES wins, NO wins, losing claim rejected).
- Non-oracle-signer cannot resolve.

### 3.6. Deploy to devnet

- Record program ID in `.env` and `packages/shared/config.ts`.
- Initialize `Config` account with keys generated in Phase 0.
- Create at least one test market (BTC $150k) pointing at a real Polymarket market ID.

**Track A deliverable:** devnet program ID + TypeScript IDL exported to `packages/shared/idl.ts`.

---

## 4. Track B — Backend (`apps/server`) — C2 through C8 + C11

Owner: one engineer. Uses Bun + a lightweight HTTP framework (Hono or Elysia — the repo already has Bun, pick one fast). All components live in `apps/server/src/`.

Suggested layout:

```
apps/server/src/
  index.ts                # HTTP entrypoint
  routes/
    quote.ts              # POST /quote
    markets.ts            # GET /markets, GET /markets/:id/book
    positions.ts          # GET /positions/:wallet
  mirror/
    gamma.ts              # discover markets
    clob-ws.ts            # WS subscriptions
    book.ts               # in-memory best-bid/ask cache
  hedger/
    index.ts              # Solana log subscriber → Polymarket order placer
    retry.ts
    slippage.ts
  exposure/
    tracker.ts            # unhedged delta per market
  oracle/
    resolver.ts           # watches Polymarket resolutions, calls resolve_market
  treasury/
    monitor.ts            # balance polling + alerts
  signer/
    quote.ts              # ed25519 signing of quotes
  polymarket/
    client.ts             # thin wrapper around @polymarket/clob-client
  solana/
    client.ts             # @solana/web3.js + anchor client using packages/shared IDL
```

### 4.1. Mirror service (C2)

1. On boot, call Polymarket's **Gamma Markets API** (`/markets`) and filter to:
   - Only markets we've whitelisted in the DB, OR
   - Top-N by volume (MVP: manually whitelist 3–5 markets for the demo to keep scope tight — mentioned as an open question in the brainstorm, and "whitelist" is the right MVP answer).
2. For each whitelisted market, upsert the `Market` row with `yesTokenId`, `noTokenId`, `tickSize`, `negRisk`.
3. Open `wss://clob.polymarket.com` and subscribe to the `market` channel for both token IDs per market.
4. Maintain an **in-memory best-bid/best-ask map** keyed by `tokenID`. Update on every `book` / `price_change` event.
5. Expose `GET /markets/:id/book` that returns the current top-of-book with our spread applied.

### 4.2. Signed-quote endpoint (C3)

`POST /quote { marketId, side, outcome, size }`:

1. Look up the current top-of-book from the mirror's in-memory cache.
2. Compute the quoted price: BUY YES = `bestYesAsk + spread`, SELL YES = `bestYesBid - spread`, etc.
3. Call `ExposureTracker.canQuote(marketId, notional)` — if false, return `OUT_OF_CAPACITY` (HTTP 429).
4. Generate a 16-byte random `nonce`, set `expiresAt = now + 5s`.
5. Sign `{ marketId, side, outcome, price, size, expiresAt, nonce }` with the ed25519 quote-signer key.
6. Persist the `Quote` row with `consumed=false`.
7. Return the `SignedQuote` shape from `packages/shared`.

> **Replay protection:** the on-chain `UsedNonce` PDA is the source of truth. The DB `Quote` table is just an audit log / debugging aid.

### 4.3. Hedging bot (C4)

1. Subscribe to `connection.onLogs(programId, ...)` for the deployed Solana program.
2. Decode logs into `OrderFilled` events using the Anchor IDL.
3. For each event:
   - Persist a `Fill` row.
   - Increment `Exposure.unhedgedUsd` for that market by `size * $1` (payout upper bound).
   - Compute the offsetting Polymarket order:
     - Solana user BUY YES → we are short YES → we **BUY YES on Polymarket**.
     - Solana user SELL YES → we are long YES → we **SELL YES on Polymarket**.
   - Call `clobClient.createAndPostOrder(...)` with `tickSize` and `negRisk` from the `Market` row, `OrderType.GTC`.
4. Handle the response:
   - **Filled in full:** mark `Hedge.status=FILLED`, decrement `Exposure.unhedgedUsd`, record realized PnL.
   - **Partial fill (Case C):** walk the book up to max slippage (2¢). Place follow-up orders at worse prices until filled or slippage cap hit. Beyond the cap: record residual exposure, keep `Exposure` elevated, alert.
   - **API failure (Case D):** exponential backoff 3× (500ms → 1s → 2s). If still failing: mark `Hedge.status=FAILED`, log alert, **halt new quotes on that market** (set a "paused" flag the quote endpoint checks).
5. Subscribe to Polymarket's `user` WS channel to get authoritative fill confirmations and reconcile against DB state.

### 4.4. Unhedged-delta tracker + kill switch (C5)

Single source of truth: the `Exposure` table, cached in memory for read speed.

- `canQuote(marketId, notional)`: return true iff `unhedgedUsd + notional <= $500`.
- Incremented by the hedging bot when it receives a Solana fill.
- Decremented when the Polymarket hedge confirms filled.
- Global kill switch: an admin endpoint `POST /admin/pause` that disables all quoting.

### 4.5. Resolution oracle signer (C6)

- Poll Polymarket's Gamma API (or watch the conditional tokens contract on Polygon) for resolution on each whitelisted market.
- **Wait 48h past resolution** to let the UMA dispute window close (Case H).
- Call `resolve_market(winning_outcome)` on the Solana program using the oracle signer keypair.
- Mark the `Market` row status.

### 4.6. Treasury + balance monitors (C7, C11)

- Every 30s, poll:
  - Solana treasury PDA USDC balance (via `getTokenAccountBalance`).
  - Polygon hedge wallet USDC balance (via Polygon RPC `balanceOf`).
- Write to `TreasuryBalance` table.
- If either drops below threshold, log a loud warning (MVP: stderr + `/admin/status` endpoint; Phase 2: Slack webhook).
- **MVP bridging is manual:** after Polymarket redemptions, the operator runs a script to bridge USDC back to Solana. A simple `scripts/bridge-usdc.ts` note in the README is enough.

### 4.7. API surface (all under `apps/server`)

- `GET /markets` — list whitelisted markets with current quotes.
- `GET /markets/:id/book` — current top-of-book with spread.
- `POST /quote` — issue signed quote.
- `GET /positions/:wallet` — decode on-chain `UserPosition` PDAs for a wallet.
- `GET /admin/status` — exposure + balances + paused flags (for the dashboard and oncall).
- `POST /admin/pause` / `POST /admin/unpause` — global kill switch (auth via simple shared secret for MVP).

### 4.8. Tests

- Unit test the quote signer against a static keypair and verify the signature round-trips through the Solana program's `ed25519` check.
- Unit test the exposure tracker edge cases (exactly at cap, concurrent increments).
- Integration test: mock Polymarket WS → signed quote → Anchor `place_order` via `anchor test` → hedger dispatches mock Polymarket order.

---

## 5. Track C — Frontend (`apps/web`) — C9 + C10

Owner: one engineer. Next.js + Tailwind (already in repo). Uses the types from `packages/shared`.

### 5.1. Pages

- `/` — market list. Cards for each whitelisted market, showing YES and NO mid prices from `GET /markets`.
- `/market/[id]` — market detail with:
  - Question, end date.
  - Live best bid/ask from `GET /markets/:id/book`, refreshed via SWR every 1s or over a local WS proxy.
  - Trade panel: outcome toggle (YES/NO), side toggle (BUY/SELL), size input, computed cost, **"Buy / Sell"** button.
  - User's current position in this market.
- `/portfolio` — list of all `UserPosition` accounts for the connected wallet.
- `/admin` (dev only) — exposure dashboard reading `GET /admin/status`.

### 5.2. Wallet connection

- Solana wallet adapter: Phantom, Backpack, Solflare. Already standard — use `@solana/wallet-adapter-react`.

### 5.3. Trade flow (Step 2.1–2.3 in [use-case.md](use-case.md))

1. User clicks Buy/Sell.
2. Frontend calls `POST /quote` with `{ marketId, side, outcome, size }`.
3. Frontend receives `SignedQuote`. Shows a **"Confirm within 5s"** countdown.
4. On confirm, frontend builds a Solana tx calling `place_order` with the signed quote as an argument. Uses the Anchor client built from `packages/shared/idl.ts`.
5. User signs with wallet. Frontend sends to RPC, waits for confirmation.
6. On success: toast + refresh positions. On failure: decode the Anchor error code and show a friendly message (`QuoteExpired` → "Price moved, fetching a new quote...", `OutOfCapacity` → "Market temporarily unavailable", etc.).
7. If `QuoteExpired`, auto-request a fresh quote and re-prompt.

### 5.4. Claim flow (Step 3.3)

- On `/market/[id]`, if market is `Resolved` and the user has winning shares, show a **"Claim X USDC"** button.
- Button builds and sends a `claim` tx.

### 5.5. Empty states and errors

- Wallet not connected → CTA.
- Mirror service offline (backend returns 503) → banner "Quotes temporarily unavailable".
- Unhedged cap hit → banner "Market temporarily unavailable, try again in a moment" (this is the user-visible text from Case E).

---

## 6. Integration sequencing (the order things must come together)

```
Day 1:           Phase 0 (everyone) — shared types, schema, env, wallets funded.
Day 2–3:         Tracks A / B / C in parallel, talking via packages/shared.
Day 3 evening:   Integration point #1 — Anchor program deployed to devnet, IDL exported.
Day 4:           Track B wires real Solana client + hedger against devnet program.
                 Track C wires real trade flow against devnet program.
Day 4 evening:   Integration point #2 — end-to-end happy path on devnet using a REAL
                 Polymarket market, small size. Alice-style buy → Solana fill →
                 Polymarket hedge fill → reconciliation row in DB.
Day 5 morning:   Unhappy paths drilled live (kill switch, cap breach, expired quote,
                 partial fill) to prove the defenses work.
Day 5 afternoon: Demo polish — seed 3-5 markets, record a fallback video.
```

---

## 7. Unhappy-path coverage matrix (from [use-case.md](use-case.md))

Every case must be demonstrable or, if not demonstrable, have the mitigation visibly in the code. None of these are "Phase 2":

| Case | What                                    | Mitigation lives in                                                    |
| ---- | --------------------------------------- | ---------------------------------------------------------------------- |
| A    | Quote expires before confirm            | Anchor `place_order` `QuoteExpired` check + frontend retry             |
| B    | Polymarket moves between quote and fill | Spread + short expiry; loss logged, alert if beyond buffer             |
| C    | Partial fill on Polymarket              | Hedger `walkBook` with 2¢ slippage cap                                 |
| D    | Polymarket hedge fails entirely         | Hedger retry → failure → `pause_market` + alert                        |
| E    | Unhedged delta exceeds cap              | Quote endpoint returns `OUT_OF_CAPACITY` pre-sign                      |
| F    | User sells before resolution            | Supported directly by `place_order(side=SELL)` + cross-market treasury |
| G    | Late claim after resolve                | Treasury never swept for 90 days; claim works any time                 |
| H    | Polymarket resolution disputed          | Oracle signer waits 48h                                                |
| I    | Polygon USDC runs out                   | Balance monitor + pause quotes affecting buys                          |
| J    | Solana USDC runs out                    | Balance monitor + bridge-back after redemptions                        |
| K    | Stale-quote replay                      | `UsedNonce` PDA                                                        |
| L    | Quote-signing key compromised           | KMS storage, admin rotate via `Config` update                          |

---

## 8. Definition of Done for the hackathon MVP

- [ ] Three or more real Polymarket markets whitelisted and visible in the UI with live quotes.
- [ ] A user can connect a Phantom wallet and buy YES on a market; trade lands on devnet.
- [ ] The hedging bot fills the offsetting order on Polymarket (real mainnet, small size) within 5 seconds.
- [ ] The `Exposure` table correctly increments on Solana fill and decrements on Polymarket fill.
- [ ] `POST /quote` returns `OUT_OF_CAPACITY` when the simulated unhedged delta exceeds $500.
- [ ] A test market can be resolved via the oracle signer and a holder can claim.
- [ ] A user can sell their position back to us before resolution.
- [ ] Kill switch works end-to-end: admin pause → frontend shows "unavailable" → unpause → trading resumes.
- [ ] `GET /admin/status` dashboard shows live exposure and both-chain balances.
- [ ] End-to-end demo recorded as a fallback in case the live demo craps out.

---

## 9. Explicitly out of scope for MVP

(From [brainstorming.md](brainstorming.md) — do not let these creep in.)

- Atomic cross-chain execution. We accept the latency risk.
- Fully on-chain matching with native market makers.
- Onboarding external market makers.
- Decentralized resolution oracle (Wormhole/Pyth/Switchboard). Trusted signer only.
- Automated bridge rebalancing — operator runs a script.
- Market types beyond binary YES/NO.
- Fancy charting, social features, notifications.

---

## 10. Open questions to answer before Phase 0 is signed off

Lifted verbatim from [brainstorming.md](brainstorming.md) — block on these with a 30-minute call, don't let them slip:

1. **ToS / geography:** Is Polymarket programmatic trading permitted from our jurisdiction?
2. **Hedging latency target:** What end-to-end latency (Solana fill → Polygon hedge filled) are we budgeting? This drives spread width.
3. **Spread calibration:** Is 1¢ actually wide enough? Re-check against observed Polymarket mid-moves over 5-second windows.
4. **Inventory cap:** Is $500 the right number for the markets we'll list, or does it need to be per-market-volatility?
5. **Market coverage:** Confirmed — whitelist 3–5 markets, not all of Polymarket.
6. **User acquisition pitch:** What is the one-sentence reason a Solana user trades here vs. bridging to Polygon? (Write this on the landing page.)
7. **Settlement propagation:** Trusted oracle signer for MVP. Confirmed.

---

## 11. Three-person assignment (suggested)

- **Engineer 1 — Chain (Track A).** Owns the Anchor program end-to-end, including tests, devnet deploy, and exporting the IDL. Also owns the on-chain ed25519 verification and nonce replay protection. Pairs with Engineer 2 on the quote signature format.

- **Engineer 2 — Backend (Track B).** Owns the mirror, signed-quote endpoint, hedging bot, exposure tracker, oracle resolver, treasury monitor, and Prisma schema. Owns the Polymarket SDK integration. Pairs with Engineer 1 on event decoding and with Engineer 3 on the REST contracts.

- **Engineer 3 — Frontend (Track C).** Owns the Next.js UI, wallet adapter, trade flow, claim flow, portfolio page, and admin dashboard. Pairs with Engineer 2 on REST contracts and with Engineer 1 on building Anchor transactions client-side.

Any cross-track ambiguity? Resolve in `packages/shared` first, then write the code. The shared package is the referee.

---

## TL;DR of the build

> Ship an Anchor program that accepts signed quotes, a backend that mirrors Polymarket's book / signs quotes / hedges fills / tracks exposure, and a Next.js UI that lets a Solana user buy prediction shares against that mirrored book. Every user trade must be neutralized on Polymarket within seconds, and the system must refuse to quote when the unhedged delta cap is near. That's the whole thing.
