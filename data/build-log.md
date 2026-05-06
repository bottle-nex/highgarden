# SolMarket build log — Hedger + Custodial Trade Flow + Resolver

> **Deployment-state-of-record.** What was actually shipped, on-chain
> artifacts, env reference, smoke-test runbook, and the current list of
> functional gaps.
>
> The companion design doc is **[hedger-plan.md](hedger-plan.md)** — that
> covers architecture rationale, the FSM, the four-layer idempotency model,
> and the failure-mode taxonomy. Each phase header in the plan now carries
> a status marker (✅ ⚠️ ❌) cross-referenced against this build log.
>
> Other context: [system.md](system.md) (centralised vs decentralised
> rationale), [use-case.md](use-case.md) (one trade end-to-end + unhappy
> paths), [steps.md](steps.md) (overall MVP phasing), [noob.md](noob.md)
> (unhedged-delta in plain English).

---

## 0. The product, in one paragraph

SolMarket is a Solana-native prediction market that bootstraps liquidity by
mirroring Polymarket's order book, hedging every Solana fill onto Polymarket
at a small spread, and propagating Polymarket's resolutions back to Solana so
users can claim payouts. **The chain holds the money and the rules; the server
holds the prices and the plumbing.** Custodial — server holds users' private
keys; users authenticate by email + OTP; the platform's bot does all
on-chain signing and Polymarket trading on their behalf.

---

## 1. Architectural decisions made during this session

### 1.1 Custodial keypair flow (vs. non-custodial Phantom)

- The original [system.md](system.md) and [use-case.md](use-case.md) drafts
  described a non-custodial flow (user signs with Phantom). During this
  session the team confirmed they pivoted to **custodial**.
- Server generates a 32-byte seed per user, encrypts with AES-256-GCM
  using `SERVER_KEY_ENCRYPTION_KEY`, stores in `User.custodialSecretEncrypted`.
- Public key derivation uses `@solana/kit`'s `createKeyPairFromPrivateKeyBytes`;
  the trade service decodes via web3.js v1's `Keypair.fromSeed` (same ed25519
  expansion).
- Trust model: user trusts the platform with their funds. Spread profits cover
  custody risk.

### 1.2 BullMQ queue between listener and Polymarket

- Original plan had the live listener call the processor directly. We moved to
  a BullMQ queue because:
  - Listener never blocks on Polymarket calls.
  - Built-in retry with exponential backoff replaces hand-rolled logic.
  - `jobId = hex(nonce)` provides queue-level dedup on top of `Fill.nonce`
    primary-key dedup, on top of `Hedge.fillId` unique constraint, on top of
    the `Hedge.status` FSM ratchet — four layers of idempotency.
  - Crash-safe: jobs persist in Redis; restart picks up where it left off.
- Decision: use ioredis (despite project CLAUDE.md preferring `Bun.redis`)
  because BullMQ requires ioredis specifically.

### 1.3 Force IPv4 + rewrite localhost on Bun + ioredis on macOS

- Diagnosed: macOS resolves `localhost` to `::1` first; Bun's ioredis
  integration has flaky IPv6 behavior → ETIMEDOUT after 10s default
  `connectTimeout`.
- Fix in [apps/hedger/queue/connection.ts](../apps/hedger/queue/connection.ts):
  set `family: 4` and rewrite hostname `localhost` → `127.0.0.1`.

### 1.4 Hard timeout on graceful shutdown

- BullMQ's `Worker.close()` waits for in-flight Redis commands; on Bun shutdown
  the underlying socket is torn down, leading to ETIMEDOUT and a hung process.
- Fix in [apps/hedger/index.ts](../apps/hedger/index.ts): each shutdown step
  wrapped in `with_timeout(promise, ms)`; outer 4-second hard ceiling that
  `process.exit(0)`s regardless. Worker uses `close(true)` (force) — drops
  in-flight jobs because the FSM + boot recovery handle them on next start.

### 1.5 Dry-run mode for Polymarket

- Bot detects missing Polymarket creds at boot and runs in DRY-RUN mode:
  every "would-be" hedge order is logged at INFO level instead of placed.
- Lets the entire pipeline run end-to-end on devnet without real-money risk.
- Flip to live by setting all 5 `HEDGER_POLYMARKET_*` envs.

### 1.6 PDA economics & spread sufficiency

Cost per `place_order` (signed by user's custodial wallet, on Solana mainnet):

| Cost | Value (≈ $160/SOL) |
| --- | --- |
| Tx fee | ~0.000005 SOL ≈ $0.0008 |
| `UsedNonce` PDA rent | ~0.00089 SOL ≈ $0.14 |
| `UserPosition` PDA rent (first time per user/market) | ~0.0013 SOL ≈ $0.21 |

**Verdict on 1¢ spread**: sufficient *only if* (a) users self-fund SOL, OR
(b) we add `close_used_nonce` instruction + auto-close `UserPosition` on claim
to recover rent. Without rent reclamation, platform loses money on small
trades when funding user SOL itself.

Recommended (not yet built):
1. Add `close = user` to `claim`'s `user_position` constraint — recovers $0.21.
2. Add `close_used_nonce(nonce)` instruction (permissionless after expiry) —
   recovers $0.14 per trade.
3. Sweeper job in hedger that batch-closes used nonces every 10 minutes.

### 1.7 Resolver max-attempts (recommended, not yet built)

- Currently failed `redeemPositions` calls retry every 60s forever.
- Add `ResolverState.redeemAttempts Int @default(0)` + `REDEEM_FAILED` stage.
- After N attempts (e.g. 100), flip to `REDEEM_FAILED`, stop retrying, alert
  once.
- "Reverting the PDA" considered and rejected: un-resolving a market would
  break finality and clawback already-processed claims. Right pattern is
  forward progress (pay users, eat the loss) or `cancel_market` + `refund`
  for genuinely broken markets (Phase 9, not MVP).

---

## 2. Devnet deployment artifacts

> All of these are PUBLIC; safe to share.

| Item | Value |
| --- | --- |
| Program ID | `2LEm66V2Ys8JbVoQfYbZqCy6YGM1wuPUc843xRx76t3P` |
| Deployer / Upgrade authority | `FnrBZ9UVbxXBStmygpRzTwc67Au6VzhNdWYKLUJv8fLh` |
| `Config.admin` pubkey | `5hwmDe6bfAN5ARF3qAAbpBQc66eSf2pEgYZxhUuRXu8H` |
| `Config.oracle_signer` pubkey | `8YMV4iS4QspGT8JFEKMRAjzjuEA62R1TZvjrPMGv1S8D` |
| `Config.quote_signer` pubkey | `FqTSLPX99S5Gw3gjzRqW76Y9dYHg12BvaPNguMqh7THG` |
| Devnet USDC test mint | `A8ZDMQpYKot1UfG19RGm3HAfkJRMDVuWkGVBrEzvXbUK` |
| Cluster | devnet |

**Old, abandoned program**: `6phzgYZv5a2k7iNKcoSjS9SaP8dzybtkVHjhcfHxWSL7` —
program data still on devnet; lost admin made redeployment necessary. Can be
closed with `solana program close <id> --url devnet` to recover ~2.7 SOL of
deploy rent.

**Keypair files on operator's local disk** (back up to password manager):
- `~/.config/solana/solmarket-admin.json`
- `~/.config/solana/solmarket-oracle.json`
- `~/.config/solana/solmarket-quote.json`
- `~/.config/solana/id.json` (deployer / upgrade authority)
- `apps/contract/target/deploy/contract-keypair.json` (program keypair)

Helper script for converting JSON-array → base58:
- `apps/contract/scripts/keypair-to-base58.ts`

---

## 3. What was built — phase by phase

### Phase 0 — Hedger scaffold

**Files:**
- `apps/hedger/package.json`, `tsconfig.json`, `.env`, `.env.example`
- `apps/hedger/config/env.ts` — zod-validated env loader, prefix `HEDGER_*`
- `apps/hedger/config/constants.ts` — non-env tunables (queue name, etc.)
- `apps/hedger/log/logger.ts` — pino logger w/ pino-pretty in dev

**Deps added:** `bullmq`, `ioredis`, `@coral-xyz/anchor`, `@solana/web3.js`,
`@polymarket/clob-client`, `ethers@5.7.2`, `pino`, `pino-pretty`, `zod`,
`bs58`.

### Phase 1 — Solana live listener

**Files:**
- `apps/hedger/solana/connection.ts` — `Connection` + `programId` factory
- `apps/hedger/solana/decoder.ts` — Anchor `BorshCoder` + `EventParser` for
  `OrderFilled` events; normalizes nonce into `Buffer`, size into `bigint`
- `apps/hedger/solana/listener.ts` — `connection.onLogs(programId, ...)`,
  reconnect on drop after `HEDGER_LIVE_LISTENER_RECONNECT_MS`
- `apps/hedger/db/cursor.repo.ts` — `BotCursor` singleton row management

### Phase 2 — Queue scaffold

**Files:**
- `apps/hedger/queue/connection.ts` — `RedisConnectionFactory` (per-component
  options object so each BullMQ instance gets its own connection)
- `apps/hedger/queue/types.ts` — `OrderFilledPayload`, `HedgeJobData`,
  `HedgeJobResult`
- `apps/hedger/queue/hedge-queue.ts` — `HedgeQueueProducer`, `enqueue()` with
  `jobId = hex(nonce)` for queue-level dedup
- `apps/hedger/queue/hedge-worker.ts` — `Worker` w/ concurrency, rate limiter,
  ETIMEDOUT-during-shutdown noise filter
- `apps/hedger/queue/queue-events.ts` — `QueueEvents` listener for
  `failed`/`stalled`/`completed`

### Phase 3 — Catch-up poller

**Files:**
- `apps/hedger/solana/poller.ts` — `getSignaturesForAddress` since cursor,
  decode each tx's logs, push to queue. JobId dedup ensures idempotent.

### Phase 4 — Polymarket client wrapper

**Files:**
- `apps/hedger/polymarket/client.ts` — `PolymarketClientFactory`,
  `is_dry_run()` gate (lazy logger to avoid module-load-order issues)
- `apps/hedger/polymarket/orders.ts` — `PolymarketOrderService.place_immediate`
  using `OrderType.FAK`. Classifies SDK errors as
  `RetryableError` vs `UnrecoverableError`. Dry-run path returns simulated
  full-fill results.
- `apps/hedger/polymarket/book.ts` — `PolymarketBookService.fetch_top_of_book`
  for sizing. Dry-run returns 49/51¢ stub.

### Phase 5 — Hedge processor (FSM)

**Files:**
- `apps/hedger/db/user.repo.ts` — `find_by_custodial_pubkey`
- `apps/hedger/db/market.repo.ts` — `find_by_solana_pda` + `polymarket` join
- `apps/hedger/db/fill.repo.ts` — idempotent insert keyed by `nonce`
- `apps/hedger/db/hedge.repo.ts` — FSM transitions (`mark_hedging`,
  `mark_filled`, `mark_partial`, `mark_failed`)
- `apps/hedger/db/exposure.repo.ts` — atomic increment/decrement, paused +
  trackerEnabled toggles
- `apps/hedger/hedger/direction.ts` — `OrderFilled` (side+outcome) →
  Polymarket spec
- `apps/hedger/hedger/processor.ts` — main job handler. Looks up user,
  market, upserts Fill + Hedge, marks HEDGING, places order, finalizes
- `apps/hedger/errors.ts` — `RetryableError`, `UnrecoverableError`

### Phase 5b — Walk-book + boot recovery

**Files:**
- `apps/hedger/hedger/walk-book.ts` — partial-fill walker with
  `HEDGER_SLIPPAGE_LIMIT_CENTS` cap
- `apps/hedger/hedger/recovery.ts` — boot scan: resets stuck `HEDGING` rows
  back to `PENDING`, recomputes `Exposure.unhedgedUsd` from outstanding fills

### Phase 6 — Admin endpoints + health

**Files:**
- `apps/hedger/health/server.ts` — `/healthz`, `/readyz` on
  `HEDGER_HEALTH_PORT` (default 4001)
- `apps/hedger/admin/server.ts` — bearer-auth admin server on
  `HEDGER_ADMIN_PORT` (default 4000):
  - `GET /admin/status` — exposure + recent fills + recent hedges + cursor
  - `GET /admin/exposure` / `PATCH /admin/exposure/:marketId`
  - `GET /admin/resolver` — every ResolverState
  - `POST /admin/resolver/:id/force-solana-resolve`
  - `POST /admin/resolver/:id/retry-redeem`
  - `POST /admin/hedges/:id/retry`
  - `GET /admin/queue/stats` — BullMQ counts
  - `POST /admin/queue/:jobId/retry`

### Phase 7 — Reconciliation

**Files:**
- `apps/hedger/reconcile/loop.ts` — periodic UMA dispute reversal detection,
  stuck-hedge sweep, exposure drift correction (every
  `HEDGER_RECONCILE_INTERVAL_MS`, default 60s)

### Phase 8 — Resolver (PRs 1–3)

**PR 1 — Gamma poller (read-only):**
- `apps/hedger/polymarket/gamma.ts` — `HedgerGammaClient.fetch_resolution`,
  surfaces `closed`, `outcomes`, `outcomePrices`, `conditionId`, `negRisk`
- `apps/hedger/db/resolver-state.repo.ts` — `ResolverStateRepo`
- `apps/hedger/resolver/poll.ts` — `ResolverPoller.tick()` polls Gamma,
  writes `polymarketResolvedAt` + `winningOutcome` when a market resolves

**PR 2 — Solana resolution submission:**
- `apps/hedger/resolver/submit-solana.ts` — `SolanaResolutionSubmitter`,
  loads `HEDGER_SOLANA_ORACLE_SIGNER_KEYPAIR`, calls `resolve_market`
- Resolver poller's `tick()` extended: after Gamma poll, scans
  `POLYMARKET_RESOLVED` rows where `now - polymarketResolvedAt >= 48h`,
  submits to Solana, flips state to `SOLANA_RESOLVED`

**PR 3 — Polygon redeem:**
- `apps/hedger/polymarket/polygon-rpc.ts` — `PolygonRpcFactory`,
  ethers v5 `JsonRpcProvider` + `Wallet`
- `apps/hedger/polymarket/conditional-tokens.ts` — Polygon mainnet addresses
  (CTF: `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045`, USDC.e:
  `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`) + minimal ABI
- `apps/hedger/polymarket/redeem.ts` — `PolymarketRedeemer.redeem` calls
  `redeemPositions(USDC.e, 0x000…, conditionId, [1, 2])`. Skips NegRisk
  markets (auto-lister filters them anyway), skips when no conditionId.
- Resolver poller `tick()` adds third phase: `redeem_polygon_for_resolved()`
- `ResolverStateRepo`: `list_awaiting_redemption`, `record_redeemed`,
  `mark_redeem_skipped`

**PR 4 — Reconciliation + admin endpoints (already in earlier phases above)**

### Auto-pause on permanent failure

**Files:**
- `apps/hedger/solana/admin-tx.ts` — `HedgerAdminTxSubmitter.pause_market`
  using `HEDGER_SOLANA_ADMIN_KEYPAIR`
- `apps/hedger/index.ts` `on_job_failed` extended:
  - Mark Hedge `FAILED` in DB
  - If admin keypair set: call `admin_pause_market` on contract,
    `Exposure.set_paused(true)`, write `record_alert`
  - If keypair not set: warn-once, skip

### Server-side trade flow

**Files:**
- `apps/server/services/service.solana-trade.ts` — `SolanaTradeService.place_order`:
  decrypts user's custodial seed, reconstructs `Keypair.fromSeed`, asserts
  derived pubkey matches stored, builds tx with Ed25519 verify + `place_order`
  via `SolmarketClient.placeOrder`, submits.
- `apps/server/services/service.quote-signer.ts` — ed25519 signs the
  borsh-serialized quote
- `apps/server/services/service.exposure-reader.ts` — reads `Exposure` row,
  returns `canQuote(marketId, notional)` verdict
- `apps/server/services/service.solana-claim.ts` — `SolanaClaimService.claim`
  for resolved markets
- `apps/server/services/service.test-fund.ts` — admin-only: airdrops SOL +
  mints test USDC to a user's custodial wallet
- `apps/server/services/service.solana-admin.ts` — `SolanaAdminService.create_market`
  for the "Approve + List on Solana" flow
- Controllers under `apps/server/controllers/markets/`:
  - `controller.quote.ts` — `POST /api/v1/markets/:id/quote`
  - `controller.place-order.ts` — `POST /api/v1/markets/:id/place-order`
  - `controller.claim.ts` — `POST /api/v1/markets/:id/claim`
- Controllers under `apps/server/controllers/admin/`:
  - `controller.approve-and-list.ts` — `POST /api/v1/admin/approve-and-list/:marketId`
  - `controller.fund-by-email.ts` — `POST /api/v1/admin/fund-by-email`
  - `controller.test-fund.ts` — `POST /api/v1/admin/test-fund/:userId`
- Routers updated: `routers/markets/router.markets.ts`,
  `routers/admin/router.admin.ts`

### Server env additions

Added to `apps/server/config/config.env.ts`:
- `SERVER_SOLANA_PROGRAM_ID` (default `2LEm66V2Ys8JbVoQfYbZqCy6YGM1wuPUc843xRx76t3P`)
- `SERVER_SOLANA_ADMIN_KEYPAIR` (optional — needed for create_market + test-fund)
- `SERVER_QUOTE_SIGNER_KEYPAIR` (optional — needed for /quote)
- `SERVER_QUOTE_EXPIRY_SECONDS` (default 5)
- `SERVER_QUOTE_SPREAD_CENTS` (default 1)
- `SERVER_UNHEDGED_DELTA_CAP_USD` (default 500)

### Frontend wiring

**Files:**
- `apps/web/src/lib/api/trading.ts` — new `TradingApi` class with
  `request_quote`, `place_order`, `claim`. `TradingError` translates server
  error codes → user-friendly messages.
- `apps/web/src/lib/api/admin.ts` — added `approveAndListOnSolana`,
  `fundUserByEmail`
- `apps/web/src/components/event/EventTradePanel.tsx` — wired `handle_submit`
  to call `request_quote` → `place_order`. Added input mode toggle (USDC ↔
  Shares), disable_reason logic, claim button on resolved markets.
- `apps/web/src/components/admin/ListingRow.tsx` — added "Approve + List on
  Solana" button (third button, indigo)
- `apps/web/src/components/admin/FundUserButton.tsx` — new "Fund user"
  button + dropdown panel with verbose success toast (Copy + Explorer
  buttons per tx signature)

---

## 4. Database schema additions

### New models (in `packages/database/prisma/schema/hedger.prisma`)

- `BotCursor` — singleton row tracking `lastProcessedSignature`,
  `lastProcessedSlot`, `liveStreamConnected/Disconnected/PollerLastRun` ts.
- `ResolverState` — per-market resolution lifecycle:
  `stage`, `polymarketResolvedAt`, `winningOutcome`, `solanaResolveTxSig`,
  `solanaResolvedAt`, `polymarketRedeemedAt`, `polymarketRedeemTxHash`,
  `notes`.
- `HedgerEvent` — append-only audit log: `level` (INFO/WARN/ERROR/ALERT),
  `category`, `message`, `payload` (JSONB).

### New enums (in `enums.prisma`)

- `HedgeStatus`: added `HEDGING` value (now PENDING/HEDGING/FILLED/PARTIAL/FAILED)
- `HedgerEventLevel`: INFO / WARN / ERROR / ALERT
- `ResolverStage`: PENDING / POLYMARKET_RESOLVED / SOLANA_RESOLVED / REDEEMED

### Field additions to existing models

`Hedge`:
- `bullJobId String? @unique` — ties DB row to BullMQ job
- `clientOrderId String? @unique` — `hedger-${nonceHex}`
- `polymarketTokenId String?`
- `polymarketSide Side?`
- `requestedSize Int?`
- `completedAt DateTime?`

`Exposure`:
- `trackerEnabled Boolean @default(true)` — toggleable cap bypass
- `paused Boolean @default(false)` — mirror of contract market.paused
- `lastIncrementAt`, `lastDecrementAt DateTime?`

`User` (added by friend's seed-management code, not by us):
- `custodialPublicKey String? @unique`
- `custodialSecretEncrypted String?`

### Migration

`packages/database/prisma/migrations/20260502110726_add_hedger_models/migration.sql`

---

## 5. Environment variable reference

### `apps/hedger/.env`

```bash
DATABASE_URL=postgres://user:password@localhost:5435/solmarket_db
HEDGER_REDIS_URL=redis://localhost:6380
HEDGER_REDIS_TLS=false

HEDGER_SOLANA_RPC_URL=https://devnet.helius-rpc.com/?api-key=…
HEDGER_SOLANA_RPC_WS_URL=wss://devnet.helius-rpc.com/?api-key=…
HEDGER_SOLANA_PROGRAM_ID=2LEm66V2Ys8JbVoQfYbZqCy6YGM1wuPUc843xRx76t3P
HEDGER_SOLANA_COMMITMENT=confirmed

# optional — needed for resolver Phase 2 + auto-pause
HEDGER_SOLANA_ADMIN_KEYPAIR=
HEDGER_SOLANA_ORACLE_SIGNER_KEYPAIR=

HEDGER_POLYMARKET_REST_URL=https://clob.polymarket.com
HEDGER_POLYMARKET_WS_URL=wss://clob.polymarket.com
HEDGER_POLYMARKET_GAMMA_URL=https://gamma-api.polymarket.com

# optional — flip OUT of dry-run mode by setting all 5
HEDGER_POLYMARKET_PRIVATE_KEY=
HEDGER_POLYMARKET_FUNDER_ADDRESS=
HEDGER_POLYMARKET_API_KEY=
HEDGER_POLYMARKET_API_SECRET=
HEDGER_POLYMARKET_API_PASSPHRASE=

# optional — needed for resolver Phase 3 redeem
HEDGER_POLYGON_RPC_URL=https://polygon-rpc.com

HEDGER_ADMIN_PORT=4000
HEDGER_HEALTH_PORT=4001
HEDGER_ADMIN_BEARER_TOKEN=

# tunables (defaults shown)
HEDGER_UNHEDGED_DELTA_CAP_USD=500
HEDGER_JOB_ATTEMPTS=5
HEDGER_JOB_BACKOFF_DELAY_MS=500
HEDGER_WORKER_CONCURRENCY=5
HEDGER_WORKER_RATE_LIMIT_MAX=30
HEDGER_WORKER_RATE_LIMIT_MS=1000
HEDGER_SLIPPAGE_LIMIT_CENTS=2
HEDGER_POLLER_INTERVAL_MS=10000
HEDGER_RECONCILE_INTERVAL_MS=60000
HEDGER_RESOLVER_POLL_INTERVAL_MS=60000
HEDGER_RESOLVER_DISPUTE_WINDOW_HOURS=48
HEDGER_LIVE_LISTENER_RECONNECT_MS=2000
HEDGER_OFFLINE_GRACE_PERIOD_SEC=120
HEDGER_MAX_BACKFILL_SIGNATURES=1000
HEDGER_LOG_LEVEL=info
```

### `apps/server/.env` additions

```bash
SERVER_SOLANA_PROGRAM_ID=2LEm66V2Ys8JbVoQfYbZqCy6YGM1wuPUc843xRx76t3P
SERVER_SOLANA_RPC_URL=https://devnet.helius-rpc.com/?api-key=…
SERVER_USDC_MINT=A8ZDMQpYKot1UfG19RGm3HAfkJRMDVuWkGVBrEzvXbUK
SERVER_SOLANA_ADMIN_KEYPAIR=<base58 of solmarket-admin.json>
SERVER_QUOTE_SIGNER_KEYPAIR=<base58 of solmarket-quote.json>
SERVER_QUOTE_EXPIRY_SECONDS=5
SERVER_QUOTE_SPREAD_CENTS=1
SERVER_UNHEDGED_DELTA_CAP_USD=500
```

---

## 6. End-to-end test runs (verified)

### Devnet trade roundtrip — confirmed working

Trade tx: `5jTgYiqGQM7p1vn5ieqntkgJ1aGnZjkf4AeNBiSbPHZ7YmDthCdJdarwYZHGL7RYdyeNEYw8dNdxfdLC5Vfs3mHG`

Sequence:
1. `POST /api/v1/markets/:id/quote` body
   `{ "side": "BUY", "outcome": "YES", "size": 10 }`
   → returns SignedQuote `{ market, side, outcome, price: 51, size: 10, …, nonceHex, signatureBase64, signerPubkey }`
2. `POST /api/v1/markets/:id/place-order` body = the SignedQuote
   → returns `{ txSignature, marketPda, userPubkey }`
3. Hedger logs (within ~13ms of OrderFilled emission):
   ```
   INFO enqueued hedge job  jobId=… source=live market=…
   INFO processing job       jobId=… attemptsMade=0
   WARN polymarket credentials missing — running in DRY-RUN mode.
   INFO >>> HEDGE: attempting to buy/sell on Polymarket
        polymarketSide=BUY  outcome=YES  shares=10  priceCents=51
   INFO DRY-RUN: would place Polymarket FAK order
   INFO job completed        result={ status: FILLED, filledSize: 10 }
   ```
4. ~10s later, the catch-up poller re-discovers the same event and tries to
   enqueue with the same `jobId = hex(nonce)`. BullMQ correctly rejects as
   duplicate:
   ```
   DEBUG duplicate job  jobId=…  source=poller
   ```

This proves: live listener latency, queue idempotency, FSM lifecycle,
direction logic, exposure increment/decrement, dry-run safety.

### Trade economics for that test trade

- User paid: 10 shares × 51¢ = **$5.10 USDC** (transferred from custodial
  wallet → treasury vault PDA).
- User received: 10 YES shares minted to `UserPosition` PDA.
- Outcome:
  - YES wins → user redeems for $10 → +$4.90 profit.
  - NO wins → user gets $0 → −$5.10 loss.
- Platform unhedged delta would have been $10 (size × $1 upper bound) until
  the dry-run "fill" instantly decremented it.

---

## 7. Operational runbook

### Boot the full stack

```bash
# infra (docker-compose.yml at repo root)
docker compose up -d  # starts redis (6380) + postgres (5435)

# server (port 8080)
cd apps/server && bun --hot index.ts

# hedger (admin port 4000, health port 4001)
cd apps/hedger && bun --hot index.ts

# mirror (Polymarket book streaming, used by /quote)
cd apps/mirror && bun --hot index.ts

# web
cd apps/web && bun dev
```

### Smoke test from Postman

1. Sign in → grab JWT
2. `GET /api/v1/users/me/wallet` → confirms custodial wallet exists
3. `POST /api/v1/admin/test-fund/<userId>` body
   `{ "solLamports": 50000000, "usdcAmount": 100 }`
   → returns 2 tx signatures
4. `POST /api/v1/markets/<marketId>/quote` body
   `{ "side": "BUY", "outcome": "YES", "size": 10 }`
   → returns SignedQuote (within 5s expiry window)
5. `POST /api/v1/markets/<marketId>/place-order` body = the SignedQuote's
   `data` field (NOT the wrapper)
6. Watch hedger log:
   ```bash
   tail -f /tmp/hedger-boot.log | grep -E "HEDGE|enqueued|processing"
   ```

### Approve a market on Solana

1. Sign into `/admin` page (admin email required).
2. Click **"Approve + List on Solana"** on a discovered listing.
3. Server calls `create_market` on-chain via `SolanaAdminService`, populates
   `Market.solanaMarketPda`, flips `Listing.status = APPROVED`.
4. Hedger can now resolve `OrderFilled` events for that market.

### Fund a test user

`/admin` → "Fund user" button → email + SOL (decimal, e.g. `0.05`) + USDC
(decimal, e.g. `1`). Server transfers SOL from admin keypair, mints USDC
from the test mint to the user's USDC ATA.

### Cleanup stuck ports / processes

```bash
lsof -i :4000 -i :4001 -t | xargs -r kill -9   # hedger
lsof -i :8080 -t | xargs -r kill -9            # server
```

### Recover SOL from old program

```bash
solana program close 6phzgYZv5a2k7iNKcoSjS9SaP8dzybtkVHjhcfHxWSL7 --url devnet
# → ~2.7 SOL refunded to deployer wallet
```

---

## 8. Open gaps (functional, not UI)

### 🔴 Critical for usable beta

1. **USDC bridge Polygon → Solana** — after redemption, USDC sits on Polygon,
   nothing moves it back. Treasury drains over time.
2. **Treasury balance monitoring** — no alerts when SOL/USDC runs low on
   either chain.
3. **Custodial wallet SOL refill** — user's wallet pays tx fees, hits zero,
   silent failures.
4. **USDC withdraw flow** — funds in custodial wallets are trapped; no way to
   send out.
5. **Mirror staleness check on /quote** — if mirror's last update > 30s ago,
   `/quote` should refuse with `STALE_BOOK`.

### 🟡 Important for production safety

6. **Reconciliation against Polymarket fill history** — we only check Gamma
   resolution; never compare our `Hedge` table against Polymarket
   `getMyTrades`.
7. **Max-attempts on failed redemption** — currently retries forever.
   Add `redeemAttempts`, after N → `REDEEM_FAILED` state.
8. **Dynamic spread** — hardcoded 1¢. Should scale with realized volatility.
9. **Per-market unhedged-delta cap** — single $500 for all markets.
10. **Quote signer in KMS / HSM** — currently in env. Server compromise =
    attacker mints free quotes.
11. **Place-order RPC retry** — server doesn't retry transient Solana RPC
    failures.

### 🟢 Operational hygiene

12. **Stuck-state escalation** — alert on stuck `HEDGING` rows after threshold.
13. **Resolver `resolve_market` retry cap** — same as #7 but for the Solana
    submission phase.
14. **UMA dispute-window verification** — we use a hardcoded 48h timer; don't
    actually read UMA's optimistic oracle on Polygon to verify finalization.
15. **NegRisk market support** — auto-lister filters them; redeemer skips with
    alert; no actual redemption flow built (different contract).
16. **Audit log of issued quotes** — `Quote` rows persisted but not actively
    monitored for anomalies.

### 🔵 Resilience / nice-to-have

17. **Stale-price detection** — per-token timestamp on book cache.
18. **Polymarket WebSocket user-channel** — for fill-confirmation audit trail.
19. **`cancel_market` + `refund` instructions** — emergency lever for genuinely
    broken Polymarket markets.
20. **Tests** — zero `bun test` coverage. Direction logic, walk-book,
    idempotency edge cases all uncovered.
21. **Production deployment config** — Dockerfile, k8s manifests, log
    aggregation, etc.

### Contract-level changes for rent recovery (not yet built)

- Add `close = user` to `claim`'s `user_position` constraint → recovers $0.21
  per user/market.
- Add new `close_used_nonce(nonce)` instruction (permissionless after expiry)
  → recovers $0.14 per trade.
- Add sweeper job in hedger to batch-close used nonces.

### Polymarket creds

- `apps/hedger/scripts/derive-polymarket-keys.ts` was added during the
  session. Run once with `HEDGER_POLYMARKET_PRIVATE_KEY` set to print
  `apiKey`/`secret`/`passphrase` to the operator's terminal.
- Bot is in DRY-RUN mode until all 5 envs are populated. Flip is a restart-only
  operation — no code change needed.

---

## 9. Useful commands reference

### Schema migration

```bash
cd packages/database
DATABASE_URL='postgres://user:password@localhost:5435/solmarket_db' \
  bun x prisma migrate dev --name <descriptive_name>
bun run generate  # regenerate Prisma client
```

### Sync IDL after contract change

```bash
cd apps/contract
anchor build && bun sync   # rebuilds and copies IDL to packages/contract
```

### Devnet redeploy

```bash
# generate fresh keypairs
solana-keygen new --outfile ~/.config/solana/solmarket-admin.json --no-bip39-passphrase --silent --force
solana-keygen new --outfile ~/.config/solana/solmarket-oracle.json --no-bip39-passphrase --silent --force
solana-keygen new --outfile ~/.config/solana/solmarket-quote.json --no-bip39-passphrase --silent --force

# update Anchor.toml + lib.rs declare_id! to new program pubkey
anchor build && bun sync
anchor deploy --provider.cluster devnet

# initialize_config + create devnet USDC mint
cd apps/contract && bun scripts/initialize-deployment.ts
```

### Convert keypair to base58 for env

```bash
cd apps/contract
bun scripts/keypair-to-base58.ts ~/.config/solana/solmarket-admin.json
# → prints base58 secret to local terminal only
```

### Derive Polymarket API keys

```bash
cd apps/hedger
# Set HEDGER_POLYMARKET_PRIVATE_KEY in .env first
bun scripts/derive-polymarket-keys.ts
# → prints API key/secret/passphrase to local terminal only
```

### Inspect on-chain state

```bash
solana program show 2LEm66V2Ys8JbVoQfYbZqCy6YGM1wuPUc843xRx76t3P --url devnet
solana balance 5hwmDe6bfAN5ARF3qAAbpBQc66eSf2pEgYZxhUuRXu8H --url devnet
solana confirm <txSignature> --url devnet
```

### Inspect Redis queue

```bash
docker exec solmarket-redis redis-cli LLEN bull:hedge-orders:wait
docker exec solmarket-redis redis-cli KEYS "bull:hedge-orders:*"
```

### Inspect DB state

```sql
-- recent fills
SELECT id, side, outcome, price, size, "solanaTxSig", nonce
FROM "Fill" ORDER BY "createdAt" DESC LIMIT 10;

-- recent hedges
SELECT id, "fillId", status, "filledSize", "avgPrice", "polymarketOrderId"
FROM "Hedge" ORDER BY "createdAt" DESC LIMIT 10;

-- exposure
SELECT "marketId", "unhedgedUsd", "trackerEnabled", paused,
       "lastIncrementAt", "lastDecrementAt"
FROM "Exposure";

-- resolver state
SELECT "marketId", stage, "polymarketResolvedAt", "winningOutcome",
       "solanaResolveTxSig", "polymarketRedeemTxHash"
FROM "ResolverState";

-- recent hedger events
SELECT ts, level, category, message FROM "HedgerEvent"
ORDER BY ts DESC LIMIT 50;
```

---

## 10. Code style enforced in this session

Per user feedback (saved to user memory):

1. **Multi-function files use a class.** Single-function files can be plain
   functions. Multi-function files must group functions as class methods.
2. **No function performs more than 2 heavy tasks.** Heavy task = API call,
   DB write, non-trivial computation. Trivial helpers don't count.

Applied across all new files in `apps/hedger/`, new files in `apps/server/`
(though some pre-existing files keep their plain-function pattern), new files
in `apps/web/src/lib/api/`. Existing files (notably `apps/web/src/lib/api/markets.ts`
with 7 plain functions) were not refactored — "don't change other components".

Default to Bun (`bun`, `bun:test`, `bun.serve`, `Bun.redis`, `Bun.sql`) per
project CLAUDE.md, with two pragmatic exceptions:
- `apps/server` uses Express because it was already there.
- `apps/hedger` uses ioredis because BullMQ requires it.

---

## 11. Commit-message conventions used

Lowercase, terse summary line; multi-line body for context. Examples used
in this session:

```
hedger: resolver gamma poller (PR 1/4)

read-only resolution detection. every 60s the poller lists
our APPROVED markets with a solanaMarketPda, asks polymarket
gamma about each, and writes ResolverState.polymarketResolvedAt
…
```

```
hedger: polygon redeem of resolved positions (PR 3/4)

after solana resolve_market lands, this PR closes the loop on
polygon: the resolver tick now also calls redeemPositions(...)
…
```

---

## 12. Recommended next steps (in priority order)

For a 2-week closed-beta target:

1. **`apps/hedger/scripts/derive-polymarket-keys.ts`** — done.
2. **One real $1 trade** on Polymarket via the bot — proves live path.
3. **Claim UI** — small `/api/v1/markets/:id/claim` endpoint + button on
   trade panel when market is RESOLVED. (Started in this session — verify
   final state.)
4. **Auto-pause on permanent failure** — done in this session.
5. **Smoke-test runbook** — markdown checklist (this build-log is partial).

Then evaluate: bridge script, NegRisk support, tests, deployment config —
roughly 2 weeks more for production-ready.

---

End of build log. Add to git when ready:

```bash
git add data/build-log.md
git commit -m "docs: session export — hedger + trade flow + resolver build log"
```
