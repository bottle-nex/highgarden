# SolMarket Hedger (`apps/hedger`) — Build Plan

> Companion to [brainstorming.md](brainstorming.md), [use-case.md](use-case.md), [system.md](system.md), [steps.md](steps.md), [noob.md](noob.md).
> Owner: this is the plan for the **bot app** that hedges Solana fills onto Polymarket. Lives in its own app (`apps/hedger`), not inside `apps/server`.
> Trust model: assumes the **custodial** flow (the server holds user keypairs and signs `place_order` on behalf of users). The hedger doesn't care about that detail — it just listens to the contract's events.

> **For deployment-state-of-record (what's actually shipped, devnet artifacts, env reference, runbook, gaps), see [build-log.md](build-log.md).** This document is the design rationale; status markers (✅ ⚠️ ❌) on each section reflect what's built as of the latest build-log update.

## Status at a glance

| Phase                                                          | Plan section      | Status                                                              |
| -------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------- |
| 0 — Scaffold                                                   | §17 build order   | ✅ shipped                                                          |
| 1 — Solana wiring (live listener)                              | §3 / §7.1         | ✅ shipped                                                          |
| 2 — Queue scaffold                                             | §3 / §7 / §8      | ✅ shipped                                                          |
| 3 — Catch-up poller + cursor                                   | §3 / §7.2         | ✅ shipped                                                          |
| 4 — Polymarket client wrapper                                  | §3 / §13          | ✅ shipped (dry-run mode active)                                    |
| 5 — Hedge processor + FSM                                      | §8                | ✅ shipped                                                          |
| 5b — Walk-book + recovery                                      | §8 / §10          | ✅ shipped                                                          |
| 6 — Exposure + admin endpoints                                 | §11 / §12         | ✅ shipped                                                          |
| 7 — Reconciliation loop                                        | §7.3              | ✅ shipped                                                          |
| 8 — Resolver (Gamma → Solana → Polygon redeem)                 | §7.4              | ✅ PRs 1–3 shipped; max-attempts (PR 4 redeem retry cap) ⚠️ pending |
| Auto-pause on permanent failure                                | §15 (D)           | ✅ shipped                                                          |
| Bull Board dashboard                                           | §17 Phase 6       | ❌ not built (admin endpoints cover the basics)                     |
| `cancel_market` + `refund` (Polymarket-broken markets)         | §15 (H) extended  | ❌ not built; Phase 9 — see build-log §8                            |
| `close_used_nonce` + auto-close `UserPosition` (rent recovery) | §1.6 of build-log | ❌ not built                                                        |
| Tests (`bun test`)                                             | §16               | ❌ not built                                                        |
| Production deploy config (Dockerfile, etc.)                    | —                 | ❌ not built                                                        |

---

## 0. What this app is, and what it isn't

**Is:**

- A long-running off-chain process that subscribes to the Solana program's `OrderFilled` events, places offsetting orders on Polymarket, tracks the platform's unhedged delta, gates new quotes when the cap is breached, watches for market resolution on Polymarket, and forwards resolution to the Solana contract.
- The single piece responsible for keeping the platform **directionally neutral**.
- A separate Bun + TypeScript app under the existing Turborepo, sharing `packages/database` and `packages/types` with the rest of the monorepo.

**Is not:**

- The signed-quote endpoint (that stays on `apps/server`).
- The mirror service that streams Polymarket's order book for pricing (that stays on `apps/mirror`).
- The custodial-wallet manager (that's the friend's seed-management work, also on `apps/server`).
- A user-facing service. Its only HTTP surface is admin endpoints and a health probe.

The hedger has no UI. The only people who talk to it directly are oncall operators via `/admin/*`.

---

## 1. Mental model — what the hedger does in one paragraph

A user on SolMarket buys 100 YES at 51¢. The contract emits an `OrderFilled` event. Within roughly one second, the hedger sees that event, looks up what that user just bought, and places the offsetting order on Polymarket — in this case "buy 100 YES at 50¢." Polymarket fills it. The hedger records both legs in the database, decrements the unhedged-delta counter, and goes back to listening. The platform pocketed the 1¢ spread. The hedger did its one job.

Everything else in this document — the catch-up poller, the FSM, the reconciliation loop, the recovery routine — exists to make sure that **one job still works** when (a) the live stream drops events, (b) the bot crashes mid-hedge, (c) Polymarket times out, (d) the network is flaky, or (e) any combination of the above happens.

---

## 2. Where the hedger sits in the system

```
┌────────────────────────────────────────────────────────────────────────┐
│  USER (browser)                                                        │
│   ↓ click "Buy 100 YES"                                                │
│  apps/web (Next.js)                                                    │
│   ↓ POST /quote                                                        │
│  apps/server  ── signs quote, has custodial keypair, builds tx ────┐   │
│   ↓ submits Solana tx                                              │   │
│  apps/contract (Anchor program on Solana)                          │   │
│   ↓ verifies sig, moves USDC, mints shares, EMITS OrderFilled ────┐│   │
│                                                                   ││   │
│  ┌────────────────────────────────────────────────────────────┐  ││   │
│  │  apps/hedger  ←── subscribes to logs ──────────────────────┘│   │   │
│  │                                                             │   │   │
│  │  ── live listener (WS)                                      │   │   │
│  │  ── catch-up poller (RPC every 10s)                         │   │   │
│  │  ── recovery scan (on boot)                                 │   │   │
│  │  ── hedge processor (FSM → Polymarket)                      │   │   │
│  │  ── reconciliation loop (every 60s)                         │   │   │
│  │  ── exposure tracker (in-memory + DB)                       │   │   │
│  │  ── resolver (cron-style, checks Polymarket Gamma)          │   │   │
│  │  ── admin HTTP server (port 4000, bearer-auth)              │   │   │
│  │                                                             │   │   │
│  │  uses: packages/database, packages/types, contract IDL      │   │   │
│  └─────────────────────────────────────────────────────────────┘   │   │
│                                ↓ places hedge orders               │   │
│                          POLYMARKET CLOB (Polygon)                 │   │
└────────────────────────────────────────────────────────────────────┘   │
                                                                         │
       apps/mirror (Polymarket book stream → server's quote engine) ←────┘
```

Key data flows:

- **Inbound to hedger:** `OrderFilled` events from `apps/contract` (Solana logs). Polymarket fill confirmations on the user channel WS.
- **Outbound from hedger:** orders to Polymarket REST CLOB. Pause/unpause + resolve calls to `apps/contract`. Status data to admin clients.
- **Shared with `apps/server`:** the `Exposure` table in Postgres — the server reads `unhedgedUsd` and `trackerEnabled` to gate the `POST /quote` endpoint.

---

## 3. Folder structure

```
apps/hedger/
  package.json
  tsconfig.json
  index.ts                              # entry — boots all loops, wires shutdown
  README.md                             # how to run locally + envs

  config/
    env.ts                              # zod-validated env loader
    constants.ts                        # tunables with env overrides

  solana/
    connection.ts                       # @solana/web3.js Connection + Anchor Program
    idl.ts                              # imports IDL from apps/contract/target/idl
    listener.ts                         # logsSubscribe live stream
    poller.ts                           # getSignaturesForAddress catch-up
    decoder.ts                          # parses log → typed OrderFilled
    cursor.ts                           # persisted "lastProcessedSignature"
    submit.ts                           # build/send admin_pause + resolve_market txs

  polymarket/
    client.ts                           # @polymarket/clob-client wrapper
    auth.ts                             # API key derivation/refresh
    book.ts                             # snapshot fetch (for size/price decisions)
    user-channel.ts                     # WS subscription to our own fills
    orders.ts                           # createAndPostOrder, cancelOrder helpers
    redeem.ts                           # post-resolution conditional-token redeem
    gamma.ts                            # Gamma Markets API client (resolution polling)

  queue/
    connection.ts                       # ioredis or Bun.redis connection
    hedge-queue.ts                      # BullMQ Queue producer
    hedge-worker.ts                     # BullMQ Worker consumer
    events.ts                           # listens to 'completed' / 'failed' events
    types.ts                            # HedgeJobData type, JobName enum

  hedger/
    processor.ts                        # the worker's job handler — runs the FSM once per job
    direction.ts                        # OrderFilled → Polymarket order spec
    walk-book.ts                        # partial-fill book walker w/ slippage cap
    recovery.ts                         # boot-time exposure rebuild

  exposure/
    tracker.ts                          # in-memory + DB-persisted unhedged delta
    cap-check.ts                        # canQuote(marketId, notional)

  resolver/
    poll.ts                             # checks Polymarket Gamma for resolution
    submit-solana.ts                    # calls resolve_market on Solana
    redeem-polymarket.ts                # calls redeem on Polygon

  reconcile/
    match.ts                            # cross-check Solana fills ↔ Polymarket fills
    drift.ts                            # exposure drift detection

  admin/
    server.ts                           # tiny Bun.serve() with /admin/* routes
    auth.ts                             # bearer-token auth middleware
    handlers.ts                         # status, pause, unpause, toggle-tracker

  health/
    server.ts                           # /healthz on a separate port

  db/
    repo.ts                             # repositories: Fills, Hedges, Cursor, Exposure
                                        # (Prisma schema lives in packages/database)

  log/
    logger.ts                           # pino-style structured logger

  test/
    unit/
    integration/
```

Each module exports pure functions where possible — the loops in `index.ts` orchestrate them. This keeps everything testable without a running Solana / Polymarket.

---

## 4. Configuration constants (`config/constants.ts`)

All env-overridable. Defaults are MVP-safe.

| Constant                               | Default        | What it controls                                                                                   |
| -------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------- |
| `UNHEDGED_DELTA_CAP_USD`               | `500`          | Max promised-but-unhedged USD per market. Beyond this, server's `/quote` endpoint returns `429`.   |
| `HEDGE_QUEUE_NAME`                     | `hedge-orders` | BullMQ queue name.                                                                                 |
| `HEDGE_JOB_ATTEMPTS`                   | `5`            | BullMQ retry attempts per job before it's moved to `failed` state.                                 |
| `HEDGE_JOB_BACKOFF_TYPE`               | `exponential`  | BullMQ backoff strategy.                                                                           |
| `HEDGE_JOB_BACKOFF_DELAY_MS`           | `500`          | Base delay for exponential backoff. Attempts at 500ms, 1s, 2s, 4s, 8s.                             |
| `HEDGE_WORKER_CONCURRENCY`             | `5`            | Number of jobs a single worker processes in parallel.                                              |
| `HEDGE_WORKER_RATE_LIMIT_MAX`          | `30`           | Max jobs per `RATE_LIMIT_DURATION_MS` (Polymarket API rate-limit guardrail).                       |
| `HEDGE_WORKER_RATE_LIMIT_MS`           | `1000`         | Window for the rate limiter.                                                                       |
| `HEDGE_JOB_REMOVE_ON_COMPLETE_AGE_SEC` | `86400`        | Keep completed jobs visible for 24h then drop. (Bull Board observability.)                         |
| `HEDGE_JOB_REMOVE_ON_FAIL_AGE_SEC`     | `2592000`      | Keep failed jobs for 30 days for forensics.                                                        |
| `SLIPPAGE_LIMIT_CENTS`                 | `2`            | When walking the book for a partial fill, max additional cents above quoted price before stopping. |
| `POLLER_INTERVAL_MS`                   | `10000`        | How often the catch-up poller asks Solana RPC for new signatures.                                  |
| `RECONCILE_INTERVAL_MS`                | `60000`        | How often the reconciliation loop cross-checks Solana ↔ Polymarket ↔ Exposure.                     |
| `RESOLVER_POLL_INTERVAL_MS`            | `60000`        | How often we ask Polymarket Gamma whether a market resolved.                                       |
| `RESOLVER_DISPUTE_WINDOW_HOURS`        | `48`           | Hours to wait after Polymarket resolution before posting to Solana (UMA dispute window).           |
| `LIVE_LISTENER_RECONNECT_MS`           | `2000`         | Backoff between WS reconnect attempts.                                                             |
| `OFFLINE_GRACE_PERIOD_SEC`             | `120`          | If the bot was offline > this long and finds pending fills, auto-pause those markets and alert.    |
| `MAX_BACKFILL_SIGNATURES`              | `1000`         | Cap on signatures pulled per poll, to avoid unbounded scans.                                       |
| `ADMIN_HTTP_PORT`                      | `4000`         | HTTP port for `/admin/*`.                                                                          |
| `HEALTH_HTTP_PORT`                     | `4001`         | HTTP port for `/healthz`.                                                                          |
| `LOG_LEVEL`                            | `info`         | Logger level.                                                                                      |

---

## 5. Environment variables

These are what the user must provide in `.env`.

```bash
# ── Database ─────────────────────────────────────────────
DATABASE_URL=postgres://user:pass@host:5432/solmarket

# ── Redis (for BullMQ) ──────────────────────────────────
REDIS_URL=redis://localhost:6379
REDIS_TLS=false                     # true for managed Redis (Upstash, Redis Cloud)

# ── Solana ───────────────────────────────────────────────
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_RPC_WS_URL=wss://api.devnet.solana.com
SOLANA_PROGRAM_ID=6phzgYZv5a2k7iNKcoSjS9SaP8dzybtkVHjhcfHxWSL7

# Used to send admin_pause_market / admin_unpause_market when the hedger
# trips its own kill switch. Must match contract's config.admin.
SOLANA_ADMIN_KEYPAIR=               # base58-encoded 64-byte secret key

# Used to send resolve_market when a Polymarket market resolves and the
# 48h dispute window has passed. Must match contract's config.oracle_signer.
SOLANA_ORACLE_SIGNER_KEYPAIR=       # base58-encoded 64-byte secret key

# ── Polymarket ───────────────────────────────────────────
POLYMARKET_REST_URL=https://clob.polymarket.com
POLYMARKET_WS_URL=wss://clob.polymarket.com
POLYMARKET_GAMMA_URL=https://gamma-api.polymarket.com

# Polygon EOA controlling the Polymarket funder account
POLYMARKET_PRIVATE_KEY=             # hex-encoded Polygon private key
POLYMARKET_FUNDER_ADDRESS=          # Polymarket profile address (where USDC lives)

# Derived once via createOrDeriveApiKey() and pinned in env:
POLYMARKET_API_KEY=
POLYMARKET_API_SECRET=
POLYMARKET_API_PASSPHRASE=

# Polygon RPC for redeem transactions
POLYGON_RPC_URL=https://polygon-rpc.com

# ── Hedger HTTP ──────────────────────────────────────────
HEDGER_ADMIN_PORT=4000
HEDGER_HEALTH_PORT=4001
HEDGER_ADMIN_BEARER_TOKEN=          # shared secret for /admin/* auth

# ── Tunables (optional, all have defaults from §4) ──────
UNHEDGED_DELTA_CAP_USD=500
HEDGE_JOB_ATTEMPTS=5
HEDGE_JOB_BACKOFF_DELAY_MS=500
HEDGE_WORKER_CONCURRENCY=5
HEDGE_WORKER_RATE_LIMIT_MAX=30
HEDGE_WORKER_RATE_LIMIT_MS=1000
SLIPPAGE_LIMIT_CENTS=2
POLLER_INTERVAL_MS=10000
RECONCILE_INTERVAL_MS=60000
RESOLVER_POLL_INTERVAL_MS=60000
RESOLVER_DISPUTE_WINDOW_HOURS=48
OFFLINE_GRACE_PERIOD_SEC=120
LOG_LEVEL=info
```

The hedger fails fast on boot if any required env is missing. Use zod for validation.

---

## 6. Database schema (extends `packages/database`)

These tables go in the existing Prisma schema. Some may already exist in skeleton form — the hedger needs them filled out as below.

### 6.1 `Fill` — the canonical record of every Solana trade

```prisma
model Fill {
  nonce              Bytes    @id                  // 16 bytes — primary key, comes from OrderFilled event
  txSignature        String   @unique
  slot               BigInt
  marketPda          String                        // Solana market PDA pubkey (base58)
  polymarketMarketId String                        // mirror from event for fast lookup
  user               String                        // base58 — for custodial flow this is the custodial wallet
  side               Int                           // 0 = BUY, 1 = SELL
  outcome            Int                           // 0 = YES, 1 = NO
  size               BigInt                        // shares
  priceCents         Int                           // 1..99
  receivedAt         DateTime @default(now())
  source             String                        // "live" | "poller" | "recovery"
  hedge              Hedge?

  @@index([marketPda])
  @@index([receivedAt])
}
```

The `nonce` is the idempotency key. Two delivery paths (live + poller) both insert with `ON CONFLICT DO NOTHING` — only the winner creates the row.

### 6.2 `Hedge` — the offsetting order on Polymarket

```prisma
model Hedge {
  id                   String    @id @default(uuid())
  fillNonce            Bytes     @unique
  status               String                       // QUEUED | HEDGING | HEDGED | PARTIAL | FAILED
  bullJobId            String    @unique            // = hex(nonce); ties DB row to BullMQ job
  clientOrderId        String    @unique            // deterministic from nonce; for restart-safety
  polymarketOrderHash  String?                      // returned by Polymarket on accept
  polymarketTokenId    String                       // YES or NO conditional token
  side                 String                       // BUY | SELL on Polymarket
  requestedSize        BigInt
  filledSize           BigInt    @default(0)
  avgPriceCents        Int?
  attempts             Int       @default(0)        // mirrored from BullMQ job.attemptsMade
  lastError            String?
  startedAt            DateTime  @default(now())
  completedAt          DateTime?
  fill                 Fill      @relation(fields: [fillNonce], references: [nonce])

  @@index([status])
  @@index([startedAt])
}
```

`clientOrderId` is computed once as `hedger-${hex(nonce)}`. If we crash after sending the request but before recording the response, we can later ask Polymarket "did you receive an order with this client ID?" and reconcile.

`bullJobId = hex(nonce)` lets ops correlate a DB row to its BullMQ job in the Bull Board dashboard with a single click.

### 6.3 `Exposure` — per-market unhedged delta

```prisma
model Exposure {
  marketPda          String   @id
  unhedgedUsd        Decimal  @db.Decimal(18, 6)   // upper-bound payout outstanding
  trackerEnabled     Boolean  @default(true)        // toggleable from /admin
  paused             Boolean  @default(false)       // mirror of contract's market.paused
  lastIncrementAt    DateTime?
  lastDecrementAt    DateTime?
  updatedAt          DateTime @updatedAt
}
```

The server's `POST /quote` endpoint reads this row and returns `OUT_OF_CAPACITY` when `unhedgedUsd + notional > UNHEDGED_DELTA_CAP_USD` AND `trackerEnabled = true`. When `trackerEnabled = false`, the cap is effectively disabled — useful for demos and tests but **dangerous in production**. The admin endpoint to flip this writes here.

### 6.4 `BotCursor` — singleton, tracks where we are in Solana history

```prisma
model BotCursor {
  id                       Int       @id @default(1)
  lastProcessedSignature   String?
  lastProcessedSlot        BigInt?
  liveStreamConnectedAt    DateTime?
  liveStreamDisconnectedAt DateTime?
  pollerLastRunAt          DateTime?
  updatedAt                DateTime  @updatedAt
}
```

Single row. The catch-up poller reads `lastProcessedSignature` and pulls everything newer.

### 6.5 `ResolverState` — per-market resolution lifecycle

```prisma
model ResolverState {
  marketPda             String   @id
  polymarketResolvedAt  DateTime?
  winningOutcome        Int?                       // 0 = YES, 1 = NO
  solanaResolveTxSig    String?                    // resolve_market tx
  solanaResolvedAt      DateTime?
  polymarketRedeemedAt  DateTime?
  polymarketRedeemTxHash String?
  notes                 String?                    // free-form for ops
}
```

### 6.6 `HedgerEvent` — append-only audit log of significant events

```prisma
model HedgerEvent {
  id        BigInt   @id @default(autoincrement())
  ts        DateTime @default(now())
  level     String                                 // info | warn | error | alert
  category  String                                 // listener | poller | hedge | exposure | resolver | admin
  message   String
  payload   Json?
}
```

Used for "what did the bot do at 03:14 last night?" forensics. Not a replacement for proper logs, but durable across log rotation.

---

## 7. Loops, queues, and workers

The hedger runs **a small number of producers, a worker pool, and a few periodic loops**, plus the HTTP servers. Producers push jobs to a **BullMQ queue** backed by Redis; workers consume from it and run the FSM. This separation means the live event stream never blocks on Polymarket calls.

```
   live listener  ─┐
                   │  push job (jobId = hex(nonce))
   catch-up poller ─┼──────────────────►  ┌─────────────────┐
                   │                       │  hedge-orders   │  (BullMQ on Redis)
   recovery (boot) ─┘                       │  queue          │
                                            └────┬────────────┘
                                                 │ pulls (concurrency=N, rate-limited)
                                                 ▼
                                            ┌─────────────────┐
                                            │  hedge-worker   │
                                            │  runs processor │
                                            │  on each job    │
                                            └────┬────────────┘
                                                 │ writes to
                                                 ▼
                                            Postgres (Fill, Hedge, Exposure)

   reconciliation loop  (every 60s, separate)
   resolver loop        (every 60s, separate)
```

Producers (the things that push jobs onto the queue) **never** touch Polymarket. Their only job is "see an `OrderFilled` event, add a job to the queue with `jobId = hex(nonce)`." If the queue already has that jobId, BullMQ rejects the duplicate — so the live listener and the catch-up poller can both fire without coordinating.

### 7.1 Live event listener (`solana/listener.ts`) — **producer**

Subscribes to the program's logs in real time using `connection.onLogs(programId, callback, 'confirmed')`.

**On each log batch:**

1. Parse the `Program data:` lines using the Anchor IDL's `BorshEventCoder`.
2. Filter to `OrderFilled` events.
3. For each event, push a job onto the `hedge-orders` queue:

   ```ts
   await hedgeQueue.add(
     "hedge",
     { event, source: "live" },
     {
       jobId: hex(event.nonce), // dedup key
       attempts: HEDGE_JOB_ATTEMPTS,
       backoff: { type: "exponential", delay: HEDGE_JOB_BACKOFF_DELAY_MS },
       removeOnComplete: { age: HEDGE_JOB_REMOVE_ON_COMPLETE_AGE_SEC },
       removeOnFail: { age: HEDGE_JOB_REMOVE_ON_FAIL_AGE_SEC },
     },
   );
   ```

4. Done. The listener does **not** block on the worker. If `add()` returns "duplicate" (jobId collision), log info and move on — the poller already enqueued it, or the listener is double-firing on a reconnect.

**Connection management:**

- On disconnect, log a warning, record `liveStreamDisconnectedAt` in `BotCursor`, and reconnect after `LIVE_LISTENER_RECONNECT_MS`.
- On reconnect, **do not assume continuity** — the catch-up poller is what fills the gap. The listener only gives the fast path.

**Latency target:** event-to-Polymarket-order in under 1 second.

### 7.2 Catch-up poller (`solana/poller.ts`) — **producer**

Runs every `POLLER_INTERVAL_MS` (default 10s).

**Each iteration:**

1. Read `BotCursor.lastProcessedSignature`.
2. Call `connection.getSignaturesForAddress(programId, { until: lastSig, limit: MAX_BACKFILL_SIGNATURES })`.
3. For each signature returned (oldest first):
   - `getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' })`.
   - Parse logs for `OrderFilled` events.
   - Push each event to the queue with `jobId = hex(event.nonce)` and `source = 'poller'` (same shape as §7.1 — the queue's jobId dedup means duplicates are no-ops).
4. Update `BotCursor.lastProcessedSignature` to the newest sig processed.

**Why this exists:** `logsSubscribe` is best-effort. If it drops events during a reconnect, the poller fills the gap. Idempotency at the `Fill.nonce` level means duplicate deliveries are no-ops.

**On long downtime:** if the cursor is more than `OFFLINE_GRACE_PERIOD_SEC` behind wall-clock, before processing anything, the poller calls `admin_pause_market` on every market with pending fills, writes a loud `HedgerEvent`, and only then resumes processing. This is the "we missed an hour, don't try to be a hero" guardrail.

### 7.3 Reconciliation loop (`reconcile/match.ts`)

Runs every `RECONCILE_INTERVAL_MS` (default 60s).

**Each iteration:**

1. **Stuck-hedge sweep:** find `Hedge` rows in `HEDGING` status older than 30s. For each, call Polymarket `getOrder(clientOrderId)`. Three outcomes:
   - Order not found → request never reached Polymarket → flip back to `PENDING` so the processor retries.
   - Order found, fully filled → flip to `HEDGED`, update `filledSize` and `avgPriceCents`, decrement exposure.
   - Order found, partial → flip to `PARTIAL`, run the walk-book routine for the remainder.
2. **Exposure drift check:** for each market, sum `unhedgedUsd` from outstanding fills minus filled hedges. Compare to `Exposure.unhedgedUsd`. If they diverge by more than $1, log an `alert`-level `HedgerEvent` and rewrite the row from the source-of-truth sum.
3. **Polymarket fill sweep:** read recent fills from the Polymarket user channel (or REST `getMyTrades`) and confirm each maps to a known `Hedge`. Anything orphaned → log alert.

### 7.4 Resolver loop (`resolver/poll.ts`)

Runs every `RESOLVER_POLL_INTERVAL_MS` (default 60s).

**Each iteration, for each whitelisted market in DB:**

1. Skip if `ResolverState.solanaResolvedAt` is already set.
2. Hit Polymarket Gamma API and check the market's resolution status.
3. If resolved and `polymarketResolvedAt` not yet recorded, write it.
4. If `now - polymarketResolvedAt >= RESOLVER_DISPUTE_WINDOW_HOURS`, build and send the `resolve_market` transaction on Solana, signed by `SOLANA_ORACLE_SIGNER_KEYPAIR`.
5. After Solana confirms, kick off a Polygon `redeem` for our YES/NO conditional tokens. Update `polymarketRedeemTxHash`.

The resolver is intentionally lazy — markets don't resolve often, and the consequences of being a few minutes late are zero. The 48h delay is the important part.

> **Architectural note:** the resolver could live in its own `apps/oracle` if the team wants to isolate the `SOLANA_ORACLE_SIGNER_KEYPAIR` blast radius. For MVP it's fine inside `apps/hedger` — they share too much infrastructure (Polymarket clients, contract IDL, DB) to be worth splitting yet. Easy to lift out later.

---

## 8. The hedge worker + processor (`queue/hedge-worker.ts` + `hedger/processor.ts`)

The worker is a BullMQ `Worker` bound to the `hedge-orders` queue. It pulls jobs and runs the processor function. The processor is a pure async function that does one hedge attempt — **retries are the queue's job, not the processor's**. If the processor throws, BullMQ catches it and reschedules per the configured backoff.

### 8.1 Worker construction

```ts
new Worker(HEDGE_QUEUE_NAME, async (job) => processHedge(job), {
  connection: redisConnection,
  concurrency: HEDGE_WORKER_CONCURRENCY,
  limiter: {
    max: HEDGE_WORKER_RATE_LIMIT_MAX,
    duration: HEDGE_WORKER_RATE_LIMIT_MS,
  },
});
```

A separate `QueueEvents` instance listens for `'failed'` (final failure after all attempts), which is where we trigger `admin_pause_market` and write the alert.

### 8.2 States in the DB (still the source of truth)

```
                ┌─────────┐
                │ enqueued│  (BullMQ job exists, no DB rows yet)
                └────┬────┘
                     ▼
           ┌─────────────────┐
           │ insert Fill row │  (idempotent on nonce; first attempt only)
           │ insert Hedge    │  status = QUEUED
           └────────┬────────┘
                    ▼
           ┌─────────────────┐
           │ flip to HEDGING │  + increment Exposure (first attempt only)
           │ + send order    │
           └────┬────────┬───┘
                │        │
        success │        │ throw → BullMQ schedules retry
                ▼        ▼
       ┌──────────┐  ┌─────────────────────────┐
       │ HEDGED   │  │ job.attemptsMade < N?   │
       │ + decr   │  └─────┬───────────────────┘
       │ Exposure │        │
       └──────────┘   yes  │  no  (BullMQ moves job to 'failed')
                           ▼
                    ┌──────────────┐  ┌──────────────────────────────┐
                    │ BullMQ waits │  │ QueueEvents 'failed' handler:│
                    │ then re-runs │  │  → flip Hedge to FAILED      │
                    │ processor    │  │  → admin_pause_market        │
                    └──────────────┘  │  → write alert HedgerEvent   │
                                      │  → Exposure stays elevated   │
                                      └──────────────────────────────┘
```

Partial fills inside one attempt: `walk-book` runs synchronously inside the processor (within the same attempt). If walking the book exhausts the slippage cap and there's still residual, the row goes to `PARTIAL` and the job is marked complete (no point retrying — the slippage cap was the binding constraint, not transient failure).

### 8.3 The processor (one job execution)

```
processHedge(job):
  ev = job.data.event
  attempt = job.attemptsMade  // 0 on first try, increments on each retry

  if attempt == 0:
    // First time we've ever seen this job
    INSERT INTO Fill (nonce, …) ON CONFLICT (nonce) DO NOTHING
    INSERT INTO Hedge (
      fillNonce, bullJobId = job.id,
      clientOrderId = "hedger-" + hex(nonce),
      status = 'QUEUED', polymarketTokenId, side, requestedSize, …
    ) ON CONFLICT DO NOTHING
    UPDATE Exposure SET unhedgedUsd += size * 1.00 WHERE marketPda = …

  else:
    // This is a retry. Hedge row already exists. Don't double-increment Exposure.
    UPDATE Hedge SET attempts = attempt, lastError = previous error WHERE bullJobId = job.id

  UPDATE Hedge SET status = 'HEDGING' WHERE bullJobId = job.id

  // First, has it already filled in a previous attempt that crashed before recording?
  if Polymarket has a record for clientOrderId:
    reconcile from Polymarket's record → mark HEDGED (or PARTIAL) and return

  // Otherwise, place the order
  result = polymarket.createAndPostOrder({ tokenID, price, side, size },
                                         { tickSize, negRisk },
                                         OrderType.IOC)

  if result.fully filled:
    UPDATE Hedge SET status='HEDGED', polymarketOrderHash=…,
                     filledSize=requestedSize, avgPriceCents=…, completedAt=now()
    UPDATE Exposure SET unhedgedUsd -= size * 1.00
    return  // job completes successfully

  if result.partial:
    walkBook(remainder, slippageBudget)  // inline; may place additional IOC orders
    if still residual:
      UPDATE Hedge SET status='PARTIAL', filledSize=actual, …
      UPDATE Exposure SET unhedgedUsd -= filledSize * 1.00
      // do NOT throw — slippage cap is intentional, not a transient failure
      return
    else:
      mark HEDGED as in the fully-filled path
      return

  if result is a transient error (network, 5xx, rate-limited):
    throw new RetryableError(...)   // BullMQ will retry per backoff config

  if result is a permanent error (bad params, account banned):
    throw new UnrecoverableError(...)  // we configure BullMQ to NOT retry these
```

`RetryableError` vs `UnrecoverableError` is just a marker. We configure the worker with a `failedReason` filter or check `job.attemptsMade` in the failed-event handler — for unrecoverable errors we skip retries by setting `attempts: 1` on those throws (or by short-circuiting in `processHedge`).

### 8.4 What the queue gives us, restated

- **Persistence:** if the bot dies between "place order" and "record HEDGED," the job is still in Redis. On restart the worker resumes it. The first thing the processor does on resume is ask Polymarket whether `clientOrderId` already filled — that's the "did the order go through?" check, free.
- **Backoff:** built-in. We don't hand-roll `setTimeout` retry loops.
- **Concurrency:** N workers process in parallel without us writing scheduling code.
- **Rate limiting:** BullMQ's limiter respects Polymarket's limits across all concurrent workers.
- **DLQ:** `failed` jobs stay in Redis (visible in Bull Board) until an operator deletes them. We never silently drop a fill.

### 8.3 Direction logic (`hedger/direction.ts`)

| Solana event side | Solana event outcome | Our exposure direction | Polymarket order |
| ----------------- | -------------------- | ---------------------- | ---------------- |
| BUY               | YES                  | short YES              | BUY YES          |
| BUY               | NO                   | short NO               | BUY NO           |
| SELL              | YES                  | long YES               | SELL YES         |
| SELL              | NO                   | long NO                | SELL NO          |

The Polymarket `tokenID` is `market.yes_token_id` or `market.no_token_id` from the contract's Market account, mirrored into our DB at market-listing time.

The Polymarket price target is **the best resting price on the opposite side of the book**:

- BUY → target = `bestAsk` (we lift the offer)
- SELL → target = `bestBid` (we hit the bid)

We don't try to be clever with limit orders — IOC at top-of-book gets the fastest fill, which is what the spread is paying for.

---

## 9. Idempotency strategy

Four independent layers. Each one alone could plausibly be defeated by some weird timing; together they make double-hedges effectively impossible.

### 9.1 Layer 0 — `BullMQ jobId` as the queue-level dedup

`jobId = hex(nonce)` is deterministic. If the live listener and the catch-up poller both call `queue.add()` for the same nonce, BullMQ accepts the first and rejects the second at the queue layer — the worker never even sees the duplicate. This is the cheapest layer and catches 99% of duplicate deliveries.

### 9.2 Layer 1 — `Fill.nonce` as primary key

The `OrderFilled` event carries the same 16-byte `nonce` the contract used in its `UsedNonce` PDA. Insert with `ON CONFLICT DO NOTHING`. Catches the case where a job somehow runs twice (e.g., a stalled-job reclaim that overlaps with the original worker still finishing).

### 9.3 Layer 2 — `Hedge.clientOrderId` as a Polymarket dedup key

`clientOrderId = "hedger-" + hex(nonce)` is deterministic. Even if a retry attempt runs after the previous attempt actually placed the order but crashed before recording the response, the retry's pre-flight check (`getOrder(clientOrderId)`) sees the existing order and reconciles instead of placing a new one. _(Verify that Polymarket's CLOB respects clientOrderId for dedup in the SDK; if not, fall back to "query by client ID then create only if absent.")_

### 9.4 Layer 3 — `Hedge.status` as the FSM ratchet

Status only moves forward (`QUEUED` → `HEDGING` → terminal). The processor refuses to re-process a `Hedge` that's already `HEDGED` or `FAILED`. Combined with `attempt == 0` guarding the Exposure increment, this prevents double-counting on retries.

Together these mean: **even if events are delivered twice by Solana, the queue dedup fails, the worker crashes mid-hedge, and Polymarket times out, we still cannot place the same hedge twice.**

---

## 10. Crash recovery on boot (`hedger/recovery.ts`)

Runs **once**, at startup, before the live listener and poller start. With the queue in front, there's much less recovery work to do — BullMQ handles in-flight jobs natively (jobs in `active` state when the worker died are reclaimed via the `stalled-check` mechanism).

```
recoverOnBoot():
  1. Let BullMQ handle stalled jobs.
     The worker is configured with stalledInterval (default 30s);
     any job that was 'active' when the previous process died will be
     moved back to 'wait' and re-picked up by the new worker. We don't
     need to do anything for these.

  2. For Hedge rows in status = HEDGING with no corresponding active or
     waiting BullMQ job (e.g., the job somehow got removed but the row
     stuck around — defensive case), check Polymarket for clientOrderId:
       - filled       → HEDGED, decrement Exposure
       - partial      → PARTIAL, decrement Exposure by filled portion, alert
       - not found    → re-enqueue a fresh job for the same nonce
                        (queue dedup ensures only one worker takes it)

  3. Recompute Exposure.unhedgedUsd from scratch by walking outstanding
     fills (fills without a terminal hedge). Compare to stored value;
     overwrite if drifted. Log if drift > $1.

  4. Check BotCursor.liveStreamDisconnectedAt and lastProcessedSignature.
     If it's been longer than OFFLINE_GRACE_PERIOD_SEC:
       - For each market with pending unhedged fills, call admin_pause_market.
       - Write an alert HedgerEvent.
       - Then continue starting the loops; the poller will catch up.

  5. Inspect the BullMQ 'failed' set.
     For each failed job, ensure the corresponding Hedge row is FAILED
     and the corresponding market is paused. (Belt-and-suspenders against
     a previous crash that lost the failed-event handler.)
```

After this completes, the live listener and poller start, both pointing at `BotCursor.lastProcessedSignature`. Steady-state operation resumes.

---

## 11. Unhedged delta tracker (`exposure/tracker.ts`)

### 11.1 What it tracks

Per market, the upper bound on USD we'd have to pay out if every still-uncovered fill went the wrong way. Updated atomically with hedge state changes.

### 11.2 Read path (used by `apps/server`'s `/quote` endpoint)

```
canQuote(marketPda, notionalUsd) -> {
  ok: boolean,
  reason?: 'OUT_OF_CAPACITY' | 'PAUSED' | 'TRACKER_DISABLED'
}:
  Read Exposure WHERE marketPda = ?
  if exposure.paused → return { ok: false, reason: 'PAUSED' }
  if !exposure.trackerEnabled → return { ok: true }   // tracker off, allow
  if exposure.unhedgedUsd + notionalUsd > UNHEDGED_DELTA_CAP_USD
      → return { ok: false, reason: 'OUT_OF_CAPACITY' }
  return { ok: true }
```

### 11.3 Where the server reads from

The server has direct DB access (same Postgres). Two options:

- **Read-through:** server queries the `Exposure` table on each `/quote`. Simple, slightly more DB load.
- **Read via hedger HTTP:** server calls `GET /admin/exposure/:marketPda`. More indirection, but isolates the schema.

**Recommendation:** read-through for MVP. The exposure row is updated by the hedger; the server only reads. Single-writer model is fine.

### 11.4 Toggling the tracker (admin requirement)

Admin UI on `apps/web` calls `PATCH /admin/exposure/:marketPda { trackerEnabled: bool }` on the hedger. The handler updates the DB row and writes a `HedgerEvent` so we have an audit trail of who turned the cap off and when.

> **Be careful:** turning the tracker off lets users buy past the cap, and if Polymarket can't keep up, real money is at risk. The admin UI should require an explicit confirmation and log the operator's identity.

---

## 12. Admin HTTP surface (`admin/server.ts`)

A minimal `Bun.serve()` instance on `HEDGER_ADMIN_PORT`. All requests require `Authorization: Bearer ${HEDGER_ADMIN_BEARER_TOKEN}`.

| Method | Path                                | Purpose                                                                   |
| ------ | ----------------------------------- | ------------------------------------------------------------------------- |
| GET    | `/admin/status`                     | Snapshot: per-market exposure, recent fills, recent hedges, cursor lag.   |
| GET    | `/admin/exposure`                   | All markets with `unhedgedUsd`, `trackerEnabled`, `paused`.               |
| GET    | `/admin/exposure/:marketPda`        | Single market detail.                                                     |
| PATCH  | `/admin/exposure/:marketPda`        | Body: `{ trackerEnabled?: bool, paused?: bool }`. Updates DB + audit log. |
| POST   | `/admin/markets/:marketPda/pause`   | Builds + sends `admin_pause_market` tx on Solana. Mirrors flag in DB.     |
| POST   | `/admin/markets/:marketPda/unpause` | Builds + sends `admin_unpause_market` tx. Mirrors in DB.                  |
| GET    | `/admin/fills?market=&since=`       | Paginated fill history.                                                   |
| GET    | `/admin/hedges?status=`             | Paginated hedge history (filter by status).                               |
| POST   | `/admin/hedges/:id/retry`           | Force a retry on a `FAILED` hedge. Audit-logged.                          |
| GET    | `/admin/cursor`                     | `BotCursor` row (for "are we caught up?").                                |
| GET    | `/admin/events?since=`              | Recent `HedgerEvent` rows.                                                |
| POST   | `/admin/resolver/:marketPda/force`  | Force-trigger a resolution check (skips dispute window — staging only).   |
| GET    | `/admin/queue/stats`                | BullMQ counts: waiting, active, completed, failed, delayed.               |
| GET    | `/admin/queue/failed`               | List of failed jobs from the DLQ.                                         |
| POST   | `/admin/queue/:jobId/retry`         | Move a failed job back into the queue for another attempt.                |
| DELETE | `/admin/queue/:jobId`               | Remove a job from the failed set (after manual reconciliation).           |
| GET    | `/admin/bull-board`                 | Mounted Bull Board UI (auth-gated) for full visual inspection.            |

**Health endpoint** on a separate port (`HEALTH_HTTP_PORT`):

| Method | Path       | Purpose                                                              |
| ------ | ---------- | -------------------------------------------------------------------- |
| GET    | `/healthz` | Liveness: returns 200 if the process is alive.                       |
| GET    | `/readyz`  | Readiness: 200 only if all loops have ticked at least once recently. |

---

## 13. Polymarket client integration

### 13.1 SDK choice

`@polymarket/clob-client` (official TypeScript). Wrap it in `polymarket/client.ts` so the rest of the code never imports the SDK directly. This makes it trivial to mock in tests and swap implementations later.

### 13.2 Auth bootstrap

On first run, a small one-shot script (`scripts/derive-polymarket-keys.ts`) calls `createOrDeriveApiKey()` once and prints the credentials. Operator pastes them into env. The hedger never derives keys at runtime — it expects them in env.

### 13.3 The order flow

```
placeHedgeOrder(spec) -> { status, filled, avgPrice, orderHash? }:
  client.createAndPostOrder(
    { tokenID: spec.tokenId, price: spec.priceUsd, side: spec.side, size: spec.size },
    { tickSize: spec.tickSize, negRisk: spec.negRisk },
    OrderType.IOC
  )
  → returns { orderID, status: matched/unmatched, filledSize, ... }
```

`OrderType.IOC` means: match what you can immediately, cancel the rest. For our use case (we want a fast hedge, not a resting order) this is the right choice. If IOC under-fills, we walk the book.

### 13.4 The user channel WS (`polymarket/user-channel.ts`)

Subscribes to our own fills on Polymarket. Fed into the reconciliation loop as the source of truth — if we think a hedge filled but the user channel has no record, something is wrong.

### 13.5 Redemption (`polymarket/redeem.ts`)

After a market resolves on Polymarket, our YES (or NO) ERC-1155 conditional tokens are redeemable for USDC on Polygon. The resolver loop calls a redeem function on the conditional tokens contract. Implementation: ethers.js + `POLYGON_RPC_URL` + `POLYMARKET_PRIVATE_KEY`.

---

## 14. Logging and observability

### 14.1 Structured logger (`log/logger.ts`)

Pino-style. Every log line is a single JSON object with at least `ts`, `level`, `category`, `msg`, plus context fields.

Categories: `boot`, `listener`, `poller`, `processor`, `polymarket`, `exposure`, `resolver`, `reconcile`, `admin`.

### 14.2 Metrics (light, MVP-appropriate)

Counters maintained in memory and exposed at `GET /admin/status`:

- `events_received_live`, `events_received_poller`
- `hedges_succeeded`, `hedges_failed`, `hedges_partial`
- `polymarket_calls_total`, `polymarket_errors_total`
- `current_unhedged_usd_per_market` (map)
- `cursor_lag_signatures` (rough — signatures behind tip)
- `last_event_processed_at` per source

Phase 2: prom-client + a `/metrics` endpoint. Not required for MVP.

### 14.3 Alerts

`HedgerEvent` rows with `level = 'alert'` are the durable alert trail. For MVP, a periodic admin dashboard query is sufficient. Phase 2: webhook out to Slack/Discord on every alert insert.

Alertable events:

- Hedge `FAILED` after retries.
- Reconciliation drift > $1.
- Bot offline > grace period at boot.
- Tracker manually disabled (audit, not urgent).
- Polymarket auth failure.
- Solana RPC unreachable for > 30s.

---

## 15. Failure modes — every case mapped to where it's handled

Reusing the case taxonomy from [use-case.md §4](use-case.md):

| Case | What happens                            | Handled in hedger by                                                                     |
| ---- | --------------------------------------- | ---------------------------------------------------------------------------------------- |
| A    | Quote expires before user confirms      | Not the hedger's problem — contract rejects the tx; no `OrderFilled` ever emits.         |
| B    | Polymarket moves between quote and fill | Hedge fills at worse price. Loss eaten; logged. Mitigation: spread + reconciliation.     |
| C    | Polymarket hedge partial fill           | `walk-book.ts` walks the book within `SLIPPAGE_LIMIT_CENTS`; residual goes to `PARTIAL`. |
| D    | Polymarket hedge fails entirely         | FSM hits retry cap → `FAILED` → `admin_pause_market` → alert.                            |
| E    | Unhedged delta exceeds cap              | `exposure/cap-check.ts` returns `OUT_OF_CAPACITY` to server; server rejects new quotes.  |
| F    | User sells before resolution            | Direction logic handles SELL events identically — bot SELLs on Polymarket.               |
| G    | Late claim after resolve                | Not the hedger's concern. Treasury management is server/ops.                             |
| H    | Polymarket dispute flips outcome        | `resolver/poll.ts` waits 48h before posting. If still flipped, ops handles manually.     |
| I    | Polygon USDC runs out                   | Polymarket returns insufficient-funds; hedge → `FAILED` → pause + alert. Ops bridges.    |
| J    | Solana USDC runs out                    | Not the hedger's concern directly. Server-side balance monitor alerts.                   |
| K    | Stale-quote replay                      | Contract rejects (UsedNonce PDA). Hedger never sees a duplicate event.                   |
| L    | Quote-signing key compromised           | Contract-level concern. Admin rotates via `Config` update.                               |

Hedger-specific failure modes not in the original list:

| Case | What happens                            | Handled by                                                                                                                  |
| ---- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| H1   | WebSocket drops a batch of events       | Catch-up poller re-fetches via RPC and pushes to queue. JobId dedups duplicates.                                            |
| H2   | Bot crashes mid-hedge                   | BullMQ stalled-job reclaim auto-resumes; processor's clientOrderId pre-check handles already-placed orders.                 |
| H3   | Bot offline for an extended period      | `OFFLINE_GRACE_PERIOD_SEC` triggers auto-pause of affected markets on resume.                                               |
| H4   | DB unreachable                          | Worker errors out, BullMQ retries the job, jobs queue up. Health endpoint red.                                              |
| H5   | Polymarket WS user channel drops        | Reconciliation loop falls back to REST `getMyTrades`.                                                                       |
| H4b  | Redis unreachable                       | Producers can't enqueue, listener buffers locally up to N events then drops + alerts; poller catches up once Redis returns. |
| H4c  | Polymarket rate-limited                 | BullMQ rate limiter throttles workers automatically; jobs queue up, no errors.                                              |
| H6   | Two events with the same nonce          | Cannot happen — contract enforces uniqueness via `UsedNonce` PDA.                                                           |
| H7   | Reconciliation finds drift              | `Exposure` row rewritten from source-of-truth sum; `alert`-level event emitted.                                             |
| H8   | Admin accidentally disables the tracker | Audit log. Does not affect existing positions, only future quote acceptance.                                                |
| H9   | Resolver posts wrong outcome            | Mitigated by 48h wait. If still wrong, contract has no built-in undo — ops only.                                            |
| H10  | RPC node returns inconsistent data      | Use `commitment: 'confirmed'` everywhere; reconciliation catches drift.                                                     |

---

## 16. Testing strategy

### 16.1 Unit tests (`test/unit/`)

- `direction.ts`: every (side × outcome) combo maps to the right Polymarket order.
- `walk-book.ts`: synthetic book + various fill scenarios → expected average price + slippage cap behavior.
- `decoder.ts`: a handful of recorded `OrderFilled` log lines decode to the expected typed event.
- `cap-check.ts`: exposure at cap edge returns the right verdict.
- `retry.ts`: backoff timings.

### 16.2 Integration tests (`test/integration/`)

Use `bun test` against a local Postgres + a mocked Polymarket client + a recorded Solana log replay.

Scenarios:

- Live event delivers → Fill inserted → Hedge to HEDGED → Exposure round-trips to zero.
- Live and poller deliver the same event → only one Fill row, one Hedge row.
- Polymarket times out → retry → succeed on second attempt.
- Polymarket fails permanently → status FAILED → pause call issued (mocked).
- Boot recovery: pre-seed a HEDGING row, simulate crash, restart → hedge resolved.
- Reconciliation: forge an exposure-drift situation → drift detected and corrected.

### 16.3 Devnet smoke test

Once deployed:

1. Server signs a `place_order` tx for a small whitelisted devnet market.
2. Confirm `OrderFilled` is emitted on devnet.
3. Confirm hedger picks it up (live path) within 2s.
4. Confirm hedger places a Polymarket order (mainnet, $1 size) within 5s.
5. Confirm Exposure increments and decrements.
6. Repeat with the live listener disabled to prove the poller catches up.

---

## 17. Build order — phase by phase

Each phase is a self-contained merge. Keep them small.

### Phase 0 — scaffold

- `apps/hedger/package.json` (Bun, `@solana/web3.js`, `@coral-xyz/anchor`, `@polymarket/clob-client`, `ethers`, `bullmq`, `ioredis`, `@bull-board/api` + `@bull-board/h3` for the dashboard, `pino`, `zod`).
- `tsconfig.json` extending the shared config.
- `index.ts` with a stub that just prints "hedger up" and exits.
- `docker-compose.yml` updates: add a Redis service.
- Add to `turbo.json` pipelines.
- DB migrations for the new tables in §6.

### Phase 1 — Solana wiring (no queue yet)

- `solana/connection.ts`, IDL import, decoder.
- `solana/listener.ts` — live `logsSubscribe`, decode, console.log only.
- Confirm: send a manual `place_order` on devnet, see the hedger log the event.

### Phase 2 — Queue scaffold

- `queue/connection.ts` (ioredis to `REDIS_URL`).
- `queue/hedge-queue.ts` — `Queue` instance, exported `enqueue(event, source)` helper using `jobId = hex(nonce)`.
- `queue/hedge-worker.ts` — `Worker` with a stub processor that just logs `job.id`.
- `queue/events.ts` — `QueueEvents` listener for `completed` / `failed` / `stalled`.
- Confirm: dispatch a fake event from a script → see the worker log it.

### Phase 3 — Fill persistence and cursor

- `db/repo.ts` — `Fill` and `Hedge` repositories, idempotent inserts.
- `solana/cursor.ts` — single-row cursor management.
- `solana/poller.ts` — backfill from `lastProcessedSignature`, push to queue.
- Listener also pushes to queue (replace console.log).
- Confirm: stop the listener, place an order, restart → poller pushes the job → worker processes it once.

### Phase 4 — Polymarket client

- `polymarket/client.ts` wrapper around the SDK.
- One-shot `scripts/derive-polymarket-keys.ts`.
- `polymarket/orders.ts` `placeIOC()` returning a typed result.
- Confirm: place a $1 order on a real Polymarket market and see it fill.

### Phase 5 — Hedge processor (happy path)

- `hedger/direction.ts` and `hedger/processor.ts` end-to-end (BullMQ handles retries).
- `Exposure` increment/decrement.
- Confirm: devnet fill → queue → worker → automatic Polymarket hedge.

### Phase 5b — FSM completeness + walk-book + recovery

- Walk-book partial-fill handler.
- `hedger/recovery.ts` boot routine.
- `RetryableError` / `UnrecoverableError` distinction + handler in `queue/events.ts`.
- Confirm: kill the bot mid-flight, restart, BullMQ stalled-reclaim picks it up, processor reconciles via clientOrderId.

### Phase 6 — Exposure tracker + admin endpoints + Bull Board

- `exposure/cap-check.ts`, server reads it.
- `admin/server.ts` with auth and the routes from §12.
- Mount Bull Board at `/admin/bull-board` (auth-gated).
- Confirm: turn the tracker off via admin, watch quotes go through past the cap (in staging only).
- Confirm: Bull Board shows live job state.

### Phase 7 — Reconciliation

- `reconcile/match.ts`, `reconcile/drift.ts`.
- Polymarket user-channel WS subscription.
- Confirm: forge a drift, watch reconciliation correct it.

### Phase 8 — Resolver

- `resolver/poll.ts` Gamma polling.
- `resolver/submit-solana.ts` calling `resolve_market`.
- `resolver/redeem-polymarket.ts` redeeming on Polygon.
- Confirm on a small test market or staging.

### Phase 9 — Health, logging, audit events

- `health/server.ts` with `/healthz` and `/readyz`.
- `HedgerEvent` writes everywhere they're listed in §14.3.
- Structured-logger sweep.

### Phase 10 — Hardening + load test

- Replay 1000 historical fills through the system.
- Force every error path in §15 once.
- Document runbook in `apps/hedger/README.md`.

---

## 18. Out of scope (for MVP)

- **Slack/Discord webhook alerts** — `HedgerEvent` rows + admin dashboard suffice.
- **Prometheus / Grafana** — `/admin/status` is enough.
- **Multi-region failover** — single instance, restart-safe is enough.
- **Decentralised resolution oracle** (Wormhole/Pyth/Switchboard) — trusted signer for now, per [system.md](system.md) and [steps.md §9](steps.md).
- **Automated cross-chain treasury rebalancing** — manual scripts on the server side.
- **Dynamic spread adjustment** — fixed 1¢, server-side concern anyway.
- **Per-market volatility-based caps** — single $500 cap for now, toggleable.
- **MEV / frontrunning protection on Polymarket** — out of scope.
- **Hot-swap of Polymarket SDK (legacy → kit)** — pin one version.

---

## 19. Open items to confirm before Phase 1 ships

1. **Polymarket clientOrderId semantics** — does Polymarket's CLOB dedup by client-supplied IDs? If not, we use the alternate "query then create" pattern in §9.3. Verify in the SDK before locking the recovery routine.
2. **Resolver location** — keep inside `apps/hedger` (current plan) or split out as `apps/oracle`? Default is "stay inside `apps/hedger`" until the oracle key needs isolation. Revisit after MVP.
3. **Polygon redeem implementation** — confirm the conditional-tokens contract address on Polygon mainnet and the exact `redeemPositions` ABI before Phase 8.
4. **Devnet vs mainnet split** — Solana side is devnet for MVP. Polymarket has no devnet — hedges are real-money on mainnet at $1 size. Operator must understand this.
5. **Whitelisted markets** — confirmed 3–5 markets per [steps.md §4.1](steps.md). The hedger trusts `Market` rows in the DB; whoever populates them (server's auto-lister, manual insert) is upstream.
6. **Server↔hedger contract for `Exposure`** — confirm the server reads the table directly (recommended) vs goes through the hedger HTTP. Single-writer is the hedger; read-through is fine.
7. **Redis hosting** — local Docker for dev; managed (Upstash, Redis Cloud, Railway) for staging/prod. Confirm whichever the team picks supports BullMQ's blocking commands and pub/sub. Most managed providers do; serverless Redis variants sometimes don't.
8. **Existing queue infra** — the project already has `apps/server/queue/auto-lister.ts`. If the server is using a different queue technology, decide whether to align (one queue lib for the monorepo) or accept divergence. BullMQ is the recommendation; revisit if the server uses something else.

---

## TL;DR

A separate Bun + TS app (`apps/hedger`) that:

- Listens to Solana program logs (live + poller + boot recovery, with `nonce` as the universal idempotency key — used as BullMQ jobId, Fill PK, and Polymarket clientOrderId).
- Pushes every `OrderFilled` event into a **BullMQ queue** on Redis. Workers pull jobs, run the FSM (`QUEUED → HEDGING → HEDGED/PARTIAL/FAILED`), and place offsetting Polymarket orders. Retries with exponential backoff are the queue's job; the processor handles one attempt and throws on transient failure.
- Maintains `Exposure.unhedgedUsd` per market; the server reads this row to gate `/quote` (with an admin-toggleable bypass).
- Reconciles state every minute against Polymarket truth.
- Resolves markets on Solana 48h after Polymarket finalises.
- Auto-pauses markets on persistent failure (job lands in BullMQ `failed` set) or extended downtime.
- Exposes `/admin/*` for ops, Bull Board for queue inspection, and `/healthz` for orchestration.
- Survives crashes cleanly via BullMQ's stalled-job reclaim, the boot recovery routine, and the four-layer idempotency model.

Profit = the spread, kept by the platform. Risk = bounded by the cap. Queue = the thing that makes "try again until it works" cheap, observable, and crash-safe. Bot = the thing that makes both of those numbers actually true.
