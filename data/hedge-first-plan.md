# Hedge-first orchestration — execution plan

> Companion to [hedger-plan.md](hedger-plan.md), [build-log.md](build-log.md),
> [system.md](system.md), [use-case.md](use-case.md).
>
> **Status: design phase, not implemented yet.** This document is the contract
> we agree on before writing code.

---

## 0. Why we're flipping the architecture

The current architecture is **Solana-first**: the contract emits `OrderFilled`
the moment the user trade lands, and the hedger reacts asynchronously.

Problem with that: between Solana commit and successful Polymarket hedge, the
platform carries **unhedged delta**. Up to a $500 cap per market, the platform
silently absorbs hedge failures. For a hackathon-stage product where every
loss is real, this is a non-trivial business risk we want eliminated.

The new architecture is **Polymarket-first**: the server's trade endpoint
hedges on Polymarket synchronously, then commits to Solana with the actual
fill data. If Polymarket can't fill, no Solana state changes — no risk.

Cross-chain atomicity is impossible, so there's a residual failure window
between "Polymarket filled" and "Solana committed". That window is bounded
to a few seconds with retries, and any orphan platform position is tracked
explicitly in `PlatformInventory` for netting against future trades.

**The custodial flow is what makes this possible.** With non-custodial
wallets, "user signs after we hedge" creates an abandonment problem. Since
we hold the user's keypair, the server orchestrates both legs in a single
HTTP request — there's no user signing step to drop.

---

## 1. Current vs proposed flow

### Current (Solana-first)

```
USER ──Buy──► WEB ──/quote──► SERVER (signs quote)
                                │
                              SignedQuote
                                ▼
              WEB ──/place-order──► SERVER (signs+submits Solana tx)
                                       │
                                  Solana tx confirmed (USDC moved, shares minted)
                                       │ OrderFilled event
                                       ▼
                                  HEDGER (live listener)
                                       │
                                  BullMQ queue
                                       │
                                  Polymarket FAK (could fail)
                                       │
                                  ⚠ if fails: market paused, user keeps shares,
                                  platform owes payouts with no hedge
```

### Proposed (Polymarket-first)

```
USER ──Buy──► WEB ──/trade──► SERVER (TradeOrchestrator)
                                │
                                ├─ Step 1: validate (auth, market, balances)
                                ├─ Step 2: read top-of-book from mirror
                                ├─ Step 3: ▼ POLYMARKET FAK ▼
                                │           │
                                │           ├─ no fill → return TRADE_UNAVAILABLE
                                │           │           NO Solana state change
                                │           │           NO USDC moved
                                │           │
                                │           └─ filled → continue with actual price+size
                                │
                                ├─ Step 4: derive user price from actual fill
                                │           (buy_price = avg_fill + spread)
                                ├─ Step 5: sign quote internally
                                ├─ Step 6: ▼ SOLANA place_order ▼
                                │           │
                                │           ├─ confirmed → success
                                │           │
                                │           └─ permanent fail (rare)
                                │                 → record PlatformInventory
                                │                 → bot will net or liquidate
                                │
                                └─ Step 7: return tx + fill data to user
```

The **hedger** stays running but is demoted to:
- Catch-up poller (safety net for orphaned `OrderFilled` events — should be ~zero)
- Reconciliation loop
- Resolver
- Auto-pause on long-lived `PlatformInventory` rows

---

## 2. The new endpoint

### `POST /api/v1/markets/:id/trade`

**Auth**: required.

**Body**:

```ts
{
  side: 'BUY' | 'SELL',
  outcome: 'YES' | 'NO',
  size: number,         // integer shares
  requestId?: string,   // client-generated UUID for idempotency
}
```

**Success response (200)**:

```ts
{
  success: true,
  data: {
    txSignature: string,         // Solana tx
    polymarketOrderId: string,   // Polymarket order
    filledShares: number,        // may be < requested if partial
    pricePaid: number,           // weighted avg in cents
    totalUsd: number,            // shares × pricePaid / 100
    requestId: string,           // echo of client UUID, server-generated if absent
  }
}
```

**Failure responses**:

| HTTP | Code | When |
| --- | --- | --- |
| 401 | `NOT_AUTHORIZED` | not signed in |
| 400 | `INVALID_DATA` | malformed body |
| 409 | `MARKET_NOT_LISTED_ON_SOLANA` | no PDA yet |
| 409 | `MARKET_PAUSED` | admin paused |
| 409 | `MARKET_RESOLVED` | already resolved |
| 402 | `INSUFFICIENT_USDC_BALANCE` | user wallet too low |
| 402 | `INSUFFICIENT_SOL_BALANCE` | user wallet has no SOL for fee |
| 503 | `TRADE_UNAVAILABLE` | Polymarket couldn't fill (book too thin, network, etc.) — **no state changed** |
| 503 | `MARKET_CLOSED_ON_POLYMARKET` | upstream market is no longer accepting orders |
| 500 | `TRADE_RECONCILE_PENDING` | Polymarket filled but Solana commit failed; entry created in PlatformInventory; ops will reconcile |

The user-facing toast for `TRADE_RECONCILE_PENDING` is something like
*"Your trade is being finalized — please refresh in a minute"*. The bot will
either retry the Solana leg in the background (most cases) or net the
position against another user's trade.

### Idempotency via `requestId`

The web client generates a UUIDv4 per "trade button click" and sends it on
every retry of that click. The server:

1. On request: `SET trade:request:{requestId} <pending> EX 60 NX` in Redis.
2. If `NX` failed (key already exists): return 409 `DUPLICATE_REQUEST`. Client
   should poll for the original result.
3. After the trade completes (success or terminal fail): write the result back
   to the same Redis key, TTL 60s, so a retry from the same `requestId`
   returns the cached result.
4. If the request is still in flight when a retry arrives: return 409 with
   `IN_FLIGHT`.

This matches Stripe's idempotency-key semantics. Prevents double-hedges from
a flaky network on the client side.

---

## 3. Schema changes

### New table — `PlatformInventory`

Tracks orphan Polymarket positions that didn't pair with a Solana commit
(rare — only when Solana submit permanently fails after Polymarket filled).

```prisma
model PlatformInventory {
  id                String         @id @default(cuid())
  marketId          String
  market            Market         @relation(fields: [marketId], references: [id])
  polymarketOrderId String         @unique
  polymarketTokenId String
  // The position the platform now holds, awaiting net or liquidation:
  side              Side           // BUY = we own these shares (long); SELL = we owe (short)
  outcome           Outcome
  shares            Int
  avgPriceCents     Int
  reason            InventoryReason
  // Lifecycle:
  createdAt         DateTime       @default(now())
  nettedAt          DateTime?      // we found an opposite-direction user trade to absorb this
  nettedAgainstFillId String?      // Fill.id of the user trade that consumed it
  liquidatedAt      DateTime?      // we sold it back to Polymarket
  liquidateOrderId  String?
  notes             String?

  @@index([marketId, nettedAt, liquidatedAt])
  @@index([createdAt])
}

enum InventoryReason {
  SOLANA_FAILED_AFTER_HEDGE   // permanent Solana failure post-Polymarket fill
  MANUAL                      // operator-injected for testing
  OTHER
}
```

Migration: `add_platform_inventory`.

### Existing tables — minor touch-ups

`Fill` gets a new optional column linking to inventory it consumed:
```prisma
model Fill {
  // ...existing fields
  nettedFromInventoryId String?
}
```

When the orchestrator is about to place a Polymarket order, it first checks
`PlatformInventory` for opposite-direction unconsumed rows on the same market.
If found, it consumes inventory instead of placing a new Polymarket order.

---

## 4. Server-side changes

### 4.1 New shared package: `@solmarket/polymarket-client`

Currently the Polymarket `clob-client` wrapper lives in `apps/hedger/polymarket/*`.
We need it on `apps/server` too. Don't copy-paste — extract to a shared package.

```
packages/polymarket-client/
  package.json
  src/
    index.ts               — public exports
    client.ts              — PolymarketClientFactory (was apps/hedger/polymarket/client.ts)
    orders.ts              — PolymarketOrderService (was apps/hedger/polymarket/orders.ts)
    book.ts                — PolymarketBookService
    redeem.ts              — PolymarketRedeemer
    polygon-rpc.ts         — PolygonRpcFactory
    conditional-tokens.ts  — Polygon CTF addresses + ABI
    gamma.ts               — Gamma client (already used by hedger)
```

Both `apps/hedger` and `apps/server` import from `@solmarket/polymarket-client`.
Hedger's `polymarket/` folder becomes thin re-exports during migration, then
gets deleted.

**Env shared**: the `HEDGER_POLYMARKET_*` envs become `POLYMARKET_*` (no prefix)
and live in both `.env` files. Or each app keeps its prefixed copy that points
at the same Polygon wallet — we can decide which is cleaner during PR 1.

### 4.2 New service: `TradeOrchestrator`

```
apps/server/services/service.trade-orchestrator.ts
```

Class with one public method:

```ts
class TradeOrchestrator {
  async execute(input: TradeInput): Promise<TradeResult>
}
```

Internally it walks Steps 1–7 from §2 above. Each step is a private method
to satisfy the project's "≤ 2 heavy tasks per function" rule:

```ts
class TradeOrchestrator {
  // public
  async execute(input)

  // private (each ≤ 2 heavy tasks)
  private async validate(input)
  private async claim_idempotency_token(requestId)
  private async release_idempotency_token(requestId, result)
  private async fetch_top_of_book(market)
  private async maybe_net_against_inventory(market, side, outcome, size)
  private async place_polymarket_hedge(market, side, outcome, size)
  private async derive_user_price(hedge_result, side, market)
  private async sign_quote_internally(market, side, outcome, price, size)
  private async submit_solana_place_order(user, quote)
  private async record_platform_inventory_on_solana_failure(...)
  private async write_audit_event(...)
}
```

### 4.3 New controller + route

```
apps/server/controllers/markets/controller.trade.ts
```

Single endpoint, thin controller — just calls the orchestrator and shapes
the response.

```
apps/server/routers/markets/router.markets.ts
+ markets_router.post('/:id/trade', requireAuth, TradeController.process);
```

The old `/quote` and `/place-order` endpoints stay during migration. They
get deprecation log lines and a `Deprecation` HTTP header pointing to
`/trade`.

### 4.4 Inventory netting service

```
apps/server/services/service.inventory-netter.ts
```

Class that, given a target `(market, side, outcome, size)`, finds and
consumes opposite-direction `PlatformInventory` rows. Returns the
remaining size that still needs a Polymarket order.

Pseudocode:

```ts
async net(market, side, outcome, size): {
  consumed: Array<{inventoryId, sharesConsumed}>,
  remainingShares: number
}
```

Used by `TradeOrchestrator.maybe_net_against_inventory()` before
`place_polymarket_hedge()`.

### 4.5 Env additions

`apps/server/.env`:

```bash
# Polymarket creds (move from apps/hedger or duplicate)
SERVER_POLYMARKET_PRIVATE_KEY=
SERVER_POLYMARKET_FUNDER_ADDRESS=
SERVER_POLYMARKET_API_KEY=
SERVER_POLYMARKET_API_SECRET=
SERVER_POLYMARKET_API_PASSPHRASE=
SERVER_POLYMARKET_REST_URL=https://clob.polymarket.com
SERVER_POLYMARKET_WS_URL=wss://clob.polymarket.com

# Already exists:
# SERVER_QUOTE_SIGNER_KEYPAIR
# SERVER_QUOTE_SPREAD_CENTS
# SERVER_USDC_MINT

# New tunables:
SERVER_TRADE_HEDGE_TIMEOUT_MS=8000          # max time waiting for Polymarket FAK
SERVER_TRADE_SOLANA_RETRY_ATTEMPTS=3
SERVER_TRADE_SOLANA_RETRY_BACKOFF_MS=500
SERVER_TRADE_IDEMPOTENCY_TTL_SEC=60
```

---

## 5. Hedger changes (mostly subtractive)

The hedger goes from "the thing that drives all hedges" to "the thing that
catches edge cases".

### What stays

- **Catch-up poller** (`solana/poller.ts`) — runs every 10s. Now it should
  almost never find anything to do, because the server already hedges
  synchronously. If it finds an `OrderFilled` event with no
  `Hedge` row in DB, that's an alert: server crashed mid-flow, came up,
  forgot. The poller treats it like a new hedge job (places Polymarket order,
  creates Hedge row). This is the safety net that prevents the
  Polymarket-first design from leaving Solana-committed-but-not-hedged
  positions.

- **Reconciliation loop** — same as today.

- **Resolver loop** — same as today.

- **Boot recovery** — same as today.

- **Auto-pause** — same as today (when a hedge fails permanently somewhere,
  pause the market on-chain).

- **Admin server** — same; just exposes a few new endpoints for
  `PlatformInventory` (list, force-liquidate, manual-net).

### What goes away

- **Live listener** — no longer the *primary* path. It can stay disabled by
  default (env flag `HEDGER_LIVE_LISTENER_ENABLED=false`) and only the
  poller backfills. Or we keep it on but with the understanding that it
  should never have anything to do (a fired event = a server crash; alert).

- **BullMQ queue + worker** — for the live trade flow, we don't need a queue
  anymore, the server orchestrates synchronously. We'll keep BullMQ for the
  *backfill* path: when the poller finds an orphan event, it drops a job and
  the worker handles it (just like today). So the queue stays but its
  "expected steady-state job rate" goes to ~zero.

- **Direction logic** + processor stay because the backfill path uses them.

### New thing for the hedger

- **Inventory liquidator** — periodic job that scans `PlatformInventory` for
  rows older than N hours that haven't been netted, and either alerts ops or
  liquidates them by placing a Polymarket order in the opposite direction.

```
apps/hedger/inventory/
  liquidator.ts            — class PlatformInventoryLiquidator
```

---

## 6. Frontend changes

### `apps/web/src/lib/api/trading.ts`

Add a new method on the existing `TradingApi` class:

```ts
public async trade(market_id: string, body: {
  side: 'BUY' | 'SELL',
  outcome: 'YES' | 'NO',
  size: number,
}): Promise<TradeResult> {
  const requestId = crypto.randomUUID();
  try {
    const { data } = await apiClient.post(
      `/markets/${market_id}/trade`,
      { ...body, requestId },
    );
    return data?.data;
  } catch (err: unknown) {
    throw this.translate_error(err);
  }
}
```

`translate_error` gets a few new cases (`MARKET_CLOSED_ON_POLYMARKET`,
`TRADE_RECONCILE_PENDING`, `TRADE_UNAVAILABLE`).

### `apps/web/src/components/event/EventTradePanel.tsx`

Replace the two-call sequence with a single call:

```tsx
// before
const signed = await trading_api.request_quote(market.id, {...});
const result = await trading_api.place_order(market.id, signed);

// after
const result = await trading_api.trade(market.id, {
  side: tab,
  outcome: selectedOutcome === Outcome.YES ? 'YES' : 'NO',
  size: computed.shares,
});
```

The frontend is gated behind a feature flag during migration:

```ts
const USE_HEDGE_FIRST_TRADE = process.env.NEXT_PUBLIC_USE_HEDGE_FIRST_TRADE === 'true';
```

When `false`, falls back to the old two-call flow.

The success toast already uses verbose copy-tx UI; minor tweak: also surface
`polymarketOrderId` so users can audit on Polymarket directly.

### Loading UX

Latency goes from ~1s (current) to ~3–8s. The Trade button needs:

- Immediate visual feedback (spinner) on click
- Disabled state until response
- Optional progress message: "Confirming on Polymarket… → Settling on Solana…"
  (two-stage status if we want to be fancy; not critical for MVP)

---

## 7. Migration plan

Run both flows in parallel with a feature flag, cut over when stable.

```
Day 0  ──── Land PR 1 (schema + shared polymarket-client package).
              No behavior change. Both apps still work.

Day 1  ──── Land PR 2 (TradeOrchestrator + new endpoint, behind flag).
              Frontend feature flag defaults FALSE. Endpoint exists but
              unused except by integration tests.

Day 2  ──── Land PR 3 (frontend wiring). Smoke-test with feature flag ON
              in one dev environment. Run a few real devnet trades.

Day 3  ──── Flip feature flag to TRUE in staging. Watch logs.
              Verify hedger's poller sees ZERO orphan events.

Day 4  ──── Flip TRUE in prod. Old endpoints still work as fallback.

Day 5–7  ── Land PR 4 (hedger demotion: disable live-listener
              processor for live-source events; keep poller for safety).

Day 8+  ─── Land PR 5 (cleanup: deprecate /quote and /place-order;
              remove queue/worker for live-source jobs).
```

### Rollback strategy

Each PR is independently revertible. If anything goes sideways at Day 4:

1. Flip frontend feature flag back to FALSE → all new trades go via the old
   path, hedger's live listener resumes its full role.
2. New endpoint still exists but unused. No data corruption — both paths
   write to the same `Fill` / `Hedge` tables.
3. Investigate, fix, re-enable.

The key invariant: **`Fill.nonce` is unique across both paths**. Even if
both flows somehow fired for the same trade, the second insert is a no-op.

---

## 8. Failure-mode coverage

For every failure point, what happens and what the user sees:

| Step | Failure | Server behavior | User sees | Platform exposure |
| --- | --- | --- | --- | --- |
| 1 (validate) | not signed in | 401 | sign-in prompt | none |
| 1 | wallet has no USDC | 402 `INSUFFICIENT_USDC_BALANCE` | "Top up first" | none |
| 1 | wallet has no SOL | 402 `INSUFFICIENT_SOL_BALANCE` | "Top up SOL" | none |
| 1 | market paused | 409 `MARKET_PAUSED` | "Trading paused" | none |
| 2 (book) | mirror returns nothing / stale | 503 `STALE_BOOK` | "Try again in a moment" | none |
| 3 (Polymarket FAK) | network error / Polymarket API down | retry up to N, then 503 `TRADE_UNAVAILABLE` | "Trade unavailable, try again" | none |
| 3 | book moved, FAK filled 0 | 503 `TRADE_UNAVAILABLE` | same | none |
| 3 | filled partial after walk-book | continue with actual size; toast "Filled X of Y" | partial success | none on un-filled portion |
| 3 | Polymarket returns "market closed" | 503 `MARKET_CLOSED_ON_POLYMARKET` | "Just closed on Polymarket" | none |
| 6 (Solana submit) | RPC blip (transient) | retry with backoff | success after delay | none |
| 6 | Solana fails permanently | record `PlatformInventory`, return 500 `TRADE_RECONCILE_PENDING` | "Trade pending, refresh in a minute" | bounded — N shares on Polymarket awaiting net |
| 6 | quote signature invalid (programmer bug) | 500 with full alert | generic error | none — Solana would reject |
| 7 (return) | response never reaches user (network) | server side fine; client retries with same `requestId` → cached result | retry returns same trade | none |

The only row with "platform exposure" is the rare Solana-fails-after-hedge
case. Mitigations:

- 99% of "Solana fails" are transient RPC issues → retry succeeds.
- For the remaining 1%, the position lives in `PlatformInventory` and gets
  netted within minutes by the next opposite-direction trade.
- After 1h with no netting, the liquidator either liquidates (eats spread)
  or alerts.

---

## 9. Schema-level idempotency

We need to be sure a single `requestId` cannot result in two `Fill` rows or
two Polymarket orders. Layers:

1. **Redis key per `requestId`** — `SET … NX EX 60` claim before doing
   anything. Releases on completion with cached result.
2. **Polymarket `clientOrderId`** — derive deterministically from
   `requestId`: `clobClient` accepts a client-supplied order ID; same
   `requestId` always produces the same `clientOrderId`. If Polymarket
   already accepted the order from a previous attempt, the duplicate is
   rejected by Polymarket (or we detect it on our end before submitting).
3. **Solana `nonce`** — derived from `requestId` too:
   `nonce = sha256(requestId).slice(0, 16)`. The on-chain `UsedNonce` PDA
   makes the same nonce reusable exactly once across all time.
4. **`Fill.nonce` unique constraint** — DB-level final guard.

Combining all four: even if a confused client retries 10 times with the
same `requestId`, only one Polymarket order, one Solana tx, one Fill row.

---

## 10. Testing plan

### Unit tests (Bun test)

- `TradeOrchestrator.validate()` — every error code path
- `InventoryNetter.net()` — partial / full / no-netting cases
- `derive_user_price()` — buy/sell × YES/NO matrix
- Idempotency layer — same `requestId` returns cached result; concurrent
  retries serialize via Redis lock

### Integration tests (against devnet + mocked Polymarket)

- Happy path: full trade end-to-end, both legs succeed
- Polymarket FAK fails (mocked) → no Solana state, returns 503
- Polymarket partial fill → Solana gets the filled-only quantity
- Solana RPC fails twice then succeeds → success returned to client
- Solana fails 3× → `PlatformInventory` row created, 500 returned
- Concurrent retries with same `requestId` → only one trade lands

### Devnet smoke test

Manual checklist (bun script that walks through):

1. Create test user, fund with SOL + USDC
2. Approve a market on Solana via admin
3. POST /trade with `{ side: BUY, outcome: YES, size: 10 }`
4. Verify: Polymarket order on explorer, Solana tx on explorer, DB rows in
   `Fill` + `Hedge` + `Exposure`
5. POST /trade with `{ side: BUY, outcome: YES, size: 1000 }` (over book
   depth) → expect partial fill
6. Force-fail Solana RPC (env override to bad URL) → expect
   `PlatformInventory` row created
7. Retry same `requestId` from step 3 → expect cached result, NO duplicate
8. Wait for catch-up poller cycle → confirm no orphan events

---

## 11. Build order — five PRs

### PR 1 — `packages/polymarket-client` extraction

- New shared package containing `PolymarketClientFactory`, order service,
  book service, redeem, gamma, polygon-rpc, conditional-tokens
- `apps/hedger/polymarket/*` becomes thin re-exports during migration
- No behavior change, both apps still work

**Commit**: `infra: extract @solmarket/polymarket-client shared package`

### PR 2 — schema + TradeOrchestrator + endpoint (behind flag)

- Migration `add_platform_inventory`
- `apps/server/services/service.trade-orchestrator.ts`
- `apps/server/services/service.inventory-netter.ts`
- `apps/server/controllers/markets/controller.trade.ts`
- Route added with `requireAuth`
- New env vars
- Endpoint works but no client uses it yet

**Commit**: `server: hedge-first trade orchestrator (behind flag)`

### PR 3 — frontend wiring (feature flag)

- New `trading_api.trade()` method
- `EventTradePanel` switches between paths based on
  `NEXT_PUBLIC_USE_HEDGE_FIRST_TRADE`
- New error code translations
- Toast updates

**Commit**: `web: hedge-first trade flow (gated by feature flag)`

### PR 4 — hedger demotion

- `HEDGER_LIVE_LISTENER_ENABLED` env (default false in production after this PR)
- Poller becomes safety-net only — finds orphan events, drops to BullMQ as
  before
- New `apps/hedger/inventory/liquidator.ts` for old PlatformInventory rows

**Commit**: `hedger: demote to safety-net role`

### PR 5 — cleanup

- Remove `/quote` and `/place-order` endpoints once flag has been TRUE in
  prod for a week with no rollback
- Remove the legacy code paths from frontend and server
- Update docs

**Commit**: `chore: remove deprecated solana-first trade endpoints`

---

## 12. Open questions / decisions to make before coding

These are the decisions I'd want pinned before PR 1 lands. Listed in
priority order:

1. **Polymarket creds location**: server-only, hedger-only, or both? My
   default: both, prefixed with each app's name (`SERVER_POLYMARKET_*`,
   `HEDGER_POLYMARKET_*`), pointing at the same wallet. Avoids weird
   cross-app dependencies.
2. **`requestId` scheme**: client-generated UUID (recommended) or
   server-generated? Client-generated lets retries dedup correctly.
3. **Fee payer for Solana tx**: admin keypair (current `claim` flow uses
   this) or user's own SOL? Admin pays = better UX. User pays = aligned
   with non-custodial future. **Recommendation: admin pays for now**, with
   a future toggle.
4. **Latency budget**: 8s default for Polymarket FAK timeout. Worth
   tightening to 5s? Polymarket's typical fill time is 1–3s, so 5s should
   be fine and reduces user wait on book-too-thin cases.
5. **Inventory liquidation policy**: net first, liquidate after 1h, alert
   after 24h? Or alert immediately and only liquidate on operator
   approval? **Recommendation: auto-liquidate after 1h**, alert at
   creation. Operators can intervene if the alert fires.
6. **Concurrent trade limit per user**: should we cap to one in-flight
   trade per user to prevent same-user double-clicking? Probably yes —
   add a per-user-per-market lock for the duration of the orchestration.
7. **What happens to old endpoints during migration**: deprecate header
   only, or actively reject after Day 7? **Recommendation: keep working
   for 14 days, then remove in PR 5**.

---

## 13. Files I'll touch (preview)

```
packages/polymarket-client/                        ← new package
  package.json
  src/index.ts
  src/client.ts
  src/orders.ts
  src/book.ts
  src/redeem.ts
  src/polygon-rpc.ts
  src/conditional-tokens.ts
  src/gamma.ts

packages/database/prisma/schema/marketplace.prisma  ← +PlatformInventory
packages/database/prisma/migrations/<ts>_add_platform_inventory/

apps/server/
  config/config.env.ts                              ← +SERVER_POLYMARKET_* + tunables
  services/service.trade-orchestrator.ts            ← new
  services/service.inventory-netter.ts              ← new
  services/service.trade-idempotency.ts             ← new (Redis-backed)
  controllers/markets/controller.trade.ts           ← new
  routers/markets/router.markets.ts                 ← +route
  services/service.singleton.ts                     ← register orchestrator
  controllers/markets/controller.quote.ts           ← deprecation header
  controllers/markets/controller.place-order.ts     ← deprecation header

apps/hedger/
  config/env.ts                                     ← +HEDGER_LIVE_LISTENER_ENABLED
  index.ts                                          ← gate live listener
  inventory/liquidator.ts                           ← new
  polymarket/                                        ← thin re-exports during PR 1, deleted in PR 5

apps/web/src/
  lib/api/trading.ts                                ← +trade() method, +error codes
  components/event/EventTradePanel.tsx              ← swap to single endpoint
  routes/routes.api.ts                              ← +TRADE_URL constant (optional)

data/
  hedge-first-plan.md                               ← this file
  build-log.md                                      ← updated after each PR
  hedger-plan.md                                    ← updated status table
```

---

## 14. Out of scope for this rewrite

The following are improvements that were already pending and stay
pending — this rewrite doesn't make them better or worse:

- Polymarket WebSocket user-channel for fill audit
- UMA dispute-window verification beyond the 48h timer
- NegRisk market support
- Decentralized oracle (Pyth/Wormhole)
- `cancel_market` + `refund` for permanently broken markets
- KMS for the quote signer key
- Tests beyond the new orchestrator
- Production deployment config

Add them after this rewrite stabilizes.

---

## 15. Recommendation

Approve PRs 1 and 2 as a unit (they're additive, no behavior change for users
yet). Test the new endpoint manually on devnet for a day. Then approve PR 3
and flip the flag in staging. The whole sequence is realistically 3 days of
focused work plus a week of soak time.

The result: zero-unhedged-money risk under normal operation, bounded risk
under rare Solana-after-Polymarket failures, identical contract surface,
much simpler hedger.

---

## TL;DR

> Move hedge orchestration into a synchronous server endpoint. Polymarket
> fills first, Solana commits second with the actual fill data. Failures at
> either step result in either a clean error (no state) or a tracked
> `PlatformInventory` row (bounded, automatically reconciled). The hedger
> becomes a safety-net rather than the primary hedge driver. Five PRs, ~3
> days of work, one-week migration window, fully reversible.
