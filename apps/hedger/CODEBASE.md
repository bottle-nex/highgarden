# Hedger v2 — Plain English Guide

## What does the hedger do?

When a user buys or sells a prediction market contract on **Solana**, the protocol takes the other side of that trade. To avoid being stuck holding that position, the hedger automatically mirrors the same trade on **Polymarket** (a separate prediction market). That way, if the user wins, the protocol wins on Polymarket too — the risk is neutralised.

Think of it like this:

> User buys YES on Solana → Hedger immediately buys YES on Polymarket → Protocol is now flat, no risk.

Once a market resolves (someone wins), the hedger also handles forwarding the result back on-chain and recovering the money from Polymarket.

---

## How the code is organised

```
index.ts              ← starts the whole process
init.services.ts      ← wires all the pieces together
clients/
  solana.ts           ← talks to Solana blockchain
  polymarket.ts       ← talks to Polymarket
repos/
  user.ts             ← reads user data from database
  market.ts           ← reads/writes market data from database
  hedge.ts            ← reads/writes fill, hedge, exposure data
ingest/
  index.ts            ← main ingestion pipeline (the "watcher")
  listener.ts         ← watches Solana in real-time (fast path)
  poller.ts           ← scans Solana history periodically (catch-up path)
  cursor.ts           ← remembers where we left off on the chain
  decoder.ts          ← converts raw Solana logs into usable events
hedger/
  index.ts            ← manages the queue and job lifecycle
  processor.ts        ← actually executes the hedge on Polymarket
  types.ts            ← type definitions for queue jobs
resolver/
  index.ts            ← detects when a market resolves, forwards result on-chain
reconcile/
  index.ts            ← safety checks — catches anything that went wrong
health.ts             ← HTTP endpoint so the server knows we're alive
envs/env.ts           ← reads and validates all environment variables
redis.ts              ← Redis connection config (used by the job queue)
log/log.ts            ← logging helper
```

---

## 1. Entry Point — `index.ts`

This is the first file that runs. It does three things:

1. Validates all environment variables (if anything is missing, the process crashes immediately with a clear error).
2. Builds and starts all services.
3. Listens for shutdown signals (Ctrl+C, server restart) so it can stop cleanly.

### `shutdown(signal)`

Called when the process receives a SIGINT or SIGTERM signal (e.g. the server is being restarted).

- Tries to stop everything cleanly within **4 seconds**.
- If called a second time before the first shutdown finishes, it force-quits immediately.
- The 4-second hard cap exists because the job queue (BullMQ) sometimes hangs sockets open and would never finish without a timeout.

---

## 2. Service Wiring — `init.services.ts`

This file is the "assembly line" — it creates every object the hedger needs and connects them together. Nothing starts here; it just builds everything.

### `init_services()`

Creates all service instances in the right order and returns them as a bundle. The order matters because some services need others to exist first (e.g. the ingester needs the hedger to exist so it can hand fills to it). No network calls happen here — just object creation.

### `start_services(s)`

Actually starts everything, in this specific order:

1. **Hedger** first — it runs boot recovery to clean up any jobs that were interrupted by a crash before accepting new ones.
2. **Ingester** second — starts watching the chain for new fills.
3. **Resolver + Reconciler** — start their periodic background loops.
4. **Health server** — starts answering `/healthz` pings.

### `stop_services(s)`

Shuts everything down in reverse order, safely. Each service is stopped independently — if one fails to stop, the others still get stopped. Order: resolver → reconciler → ingester → hedger → health server.

---

## 3. Clients

These are the two "phones" the hedger uses to talk to the outside world.

---

### `clients/solana.ts` — `SolanaClient`

Holds one shared connection to the Solana blockchain. By having only one connection, we avoid leaking websocket connections (opening a new connection for every call is a common bug).

#### `constructor()`

Reads the Solana RPC URL and program ID from environment variables and opens the connection.

#### `connection`

The live connection to Solana. Used for both HTTP calls and websocket subscriptions.

#### `program_id`

The address of our smart contract on Solana. Both the listener and poller use this to filter events to just our program.

---

### `clients/polymarket.ts` — `PolymarketClient`

The single place that knows how to talk to Polymarket. Everything from placing orders to checking if a market resolved to redeeming winnings on Polygon lives here.

Heavy resources (the authenticated order client, the Polygon wallet) are created lazily — only when first needed — so the process can start even without full credentials.

#### `get_book(token_id)`

Fetches the raw order book for a market from Polymarket's public API. Returns the raw JSON (no auth needed). Used for simple checks like "is there any liquidity?".

#### `get_market(condition_id)`

Fetches raw market metadata from Polymarket's Gamma API. Returns raw JSON. The resolver uses `fetch_resolution` instead (which parses this into a clean type).

#### `is_dry_run()`

Returns `true` if Polymarket credentials are missing from the environment. In dry-run mode, orders are logged but never actually placed — useful for testing. Logs a warning once so you don't accidentally ship to production without credentials.

#### `get_top_of_book(token_id)`

Gets the best buy price (ask) and best sell price (bid) for a market, in cents. In dry-run mode returns fake values (49¢ bid / 51¢ ask) so the rest of the logic can still be tested.

#### `place_market_order(input)`

Places an immediate-or-cancel (FAK) order on Polymarket. The order either fills right now at the current price or doesn't fill at all — no resting on the book.

Returns how many shares were filled and at what average price.

Error handling:

- "invalid signature", "forbidden", "blocked" → **permanent failure** (don't retry)
- Everything else → **temporary failure** (retry with backoff)

One tricky detail: Polymarket's API expects different "amount" units for buys vs sells:

- **BUY**: amount = shares × price (you're spending USDC)
- **SELL**: amount = shares (you're giving up shares)

#### `fetch_resolution(polymarket_market_id)`

Asks Polymarket's Gamma API "has this market resolved, and who won?". Returns a clean typed object. Only declares a winner when one outcome is clearly 100% (≥0.999) and the other is clearly 0% (≤0.001) — if it's ambiguous (e.g. a market got voided at 50/50), it returns `winningOutcomeIndex = null` so we don't forward an incorrect result.

#### `is_redeem_configured()`

Returns `true` if both the Polygon RPC URL and private key are set. The resolver checks this before trying to redeem winnings.

#### `redeem_positions(polymarket_market_id)`

Calls the Polygon blockchain to redeem our CTF (Conditional Token Framework) tokens after a market resolves. This is how we get our USDC back from Polymarket after a market ends.

Returns one of four outcomes:

- `submitted` — transaction sent, here's the hash
- `skipped_neg_risk` — NegRisk markets use a different contract, skip
- `skipped_no_condition_id` — Gamma didn't return the condition ID needed
- `skipped_not_resolved` — market hasn't fully resolved yet, try again later

**Private helpers:**

| Method                                   | What it does                                                                             |
| ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| `get_clob_client()`                      | Creates the authenticated Polymarket order client on first use                           |
| `simulate_dry_run(input)`                | Pretends the order fully filled; logs what would have been placed                        |
| `build_order_payload(input)`             | Converts our internal format into what the CLOB API expects                              |
| `build_order_options(input)`             | Packs tick size and negRisk flag for the CLOB API                                        |
| `interpret_order_response(resp, input)`  | Reads the CLOB response and extracts filled amount + avg price                           |
| `compute_filled_shares(resp, input)`     | BUY: read `takingAmount` (shares received); SELL: read `makingAmount` (shares given)     |
| `compute_avg_price(resp, input, filled)` | Calculates average price in cents from total USDC paid ÷ shares filled                   |
| `classify_order_error(err)`              | Looks at the error message and decides if it's permanent or retryable                    |
| `shape_top(summary)`                     | Converts the raw bid/ask arrays into a clean `BookTop` object with prices in cents       |
| `fetch_raw_gamma_market(id)`             | Makes the HTTP call to Gamma and normalises the response shape                           |
| `shape_resolution(raw)`                  | Converts the raw Gamma JSON into our clean `GammaResolution` type                        |
| `derive_winner(prices, closed)`          | Checks if one outcome is clearly 100% and the other is clearly 0%                        |
| `derive_resolved_at(raw)`                | Picks the resolution timestamp from `umaEndDate` or `endDate`                            |
| `get_polygon_provider()`                 | Creates the Polygon JSON-RPC provider on first use                                       |
| `get_polygon_signer()`                   | Creates the Polygon wallet/signer on first use                                           |
| `send_redeem(condition_id, market_id)`   | Submits the actual `redeemPositions` transaction on Polygon and waits for 1 confirmation |

---

## 4. Repositories

These are the "filing clerks" — they read and write to the database. No business logic here, just data in and data out.

---

### `repos/user.ts` — `UserRepo`

#### `find_by_custodial_pubkey(pubkey)`

Looks up a user by their Solana wallet address. Returns the user's database ID and pubkey, or `null` if no match. A `null` means "maybe this user's row hasn't been written yet" — the processor treats it as a temporary failure and retries.

---

### `repos/market.ts` — `MarketRepo`

Handles market data and the **resolution lifecycle** (tracking whether a market has resolved and at what stage).

Resolution lifecycle stages:

```
PENDING → POLYMARKET_RESOLVED → SOLANA_RESOLVED → REDEEMED
```

#### `find_by_solana_pda(pda)`

Given an on-chain market address (PDA), finds the matching market record in our database including its Polymarket token IDs. Used when a fill event arrives — we need to know which Polymarket tokens to buy/sell.

#### `find_by_polymarket_id(id)`

Reverse lookup — given a Polymarket market ID, finds our internal market record. Used by the resolver when it detects a Polymarket market has resolved.

#### `list_active()`

Returns all markets that have been deployed on-chain (i.e. have a Solana PDA). This is the full list the resolver and reconciler loop over each tick.

#### `resolver_find(market_id)`

Reads the resolution state row for a market. Returns `null` if we haven't created one yet.

#### `resolver_ensure(market_id)`

Creates the resolution state row if it doesn't exist. Safe to call multiple times — it's a no-op if the row already exists.

#### `resolver_record_polymarket_resolved(market_id, winning_outcome, resolved_at)`

Records that Polymarket has declared a winner for this market. Saves who won and when. Idempotent — safe to call again if Polymarket updates its data before we've submitted on-chain.

#### `resolver_list_awaiting_solana_submission(max_resolved_at)`

Returns markets where:

- Polymarket has resolved them, AND
- The resolution is older than the dispute window (we're sure it's final), AND
- We haven't yet submitted the result on Solana.

#### `resolver_record_solana_resolved(market_id, tx_sig, resolved_at)`

Records that we've successfully submitted the result on Solana. Saves the transaction signature as an audit trail.

#### `resolver_list_awaiting_redemption()`

Returns markets where we've submitted on Solana but haven't yet redeemed our CTF tokens on Polygon.

#### `resolver_record_redeemed(market_id, tx_hash, redeemed_at)`

Records that we've successfully redeemed on Polygon. Saves the Polygon tx hash. This is the final state.

#### `resolver_append_note(market_id, note)`

Writes a free-form diagnostic note onto the resolution state row. Used to record things like "skipped because negRisk" or "Polymarket returned a 500 error". Only keeps the most recent note — full history is in the logs.

---

### `repos/hedge.ts` — `HedgeRepo`

Handles the hot path: Fills, Hedges, and Exposure. These three always go together so they're in one repo.

**Fill** = a record of a user's trade on Solana.
**Hedge** = a record of our counter-trade on Polymarket.
**Exposure** = how much unhedged money we're currently holding for each market.

#### Fill methods

#### `fill_find_by_nonce(nonce_hex)`

Finds a fill by its on-chain nonce (a unique ID generated by the smart contract). This is the primary way we detect duplicate fills — if we've seen this nonce before, we already have it in the database.

#### `fill_insert_idempotent(params)`

Inserts a fill, or returns the existing one if it's already in the database. Handles the race condition where two paths (live listener and poller) might try to insert the same fill at the same time — whichever loses the race just reads the winner's row. Returns `{ row, created }` so the caller knows if this is a new fill or a duplicate.

#### Hedge methods

#### `hedge_find_by_fill_id(fill_id)`

Gets the hedge for a specific fill. Every fill has exactly one hedge (1:1 relationship).

#### `hedge_find_by_bull_job_id(job_id)`

Gets the hedge associated with a specific queue job. Used when a job permanently fails — we need to find the hedge to mark it as failed.

#### `hedge_find_in_progress()`

Returns all hedges that are in `PENDING` (never started) or `HEDGING` (started but not finished) state. Used at startup to find anything that was interrupted by a crash.

#### `hedge_create_idempotent(params)`

Creates a hedge row, or returns the existing one. Same race-safe pattern as `fill_insert_idempotent`. New hedges always start in `PENDING` status.

#### `hedge_mark_hedging(id, attempts)`

Updates the hedge status to `HEDGING` (in progress) and records which attempt number this is. Called right before we try to place the Polymarket order.

#### `hedge_mark_filled(id, order_id, filled_size, avg_price)`

Updates the hedge to `FILLED` — the Polymarket order fully executed. Records the Polymarket order ID, how many shares were filled, and the average price.

#### `hedge_mark_partial(id, order_id, filled_size, avg_price)`

Updates the hedge to `PARTIAL` — we filled _some_ shares but not all (hit the slippage limit). Records what we did fill.

#### `hedge_mark_failed(id, last_error)`

Updates the hedge to `FAILED` — we couldn't hedge at all. Records the error message.

#### `hedge_record_attempt(id, attempts, last_error)`

Records that an attempt failed without changing the final status. Used mid-retry to keep an audit trail of what went wrong on each try, so when it eventually succeeds (or finally fails), you can see what happened along the way.

#### Exposure methods

#### `exposure_find(market_id)`

Gets the current exposure record for a market — how much unhedged money we're holding.

#### `exposure_increment(market_id, delta_usd)`

Increases the unhedged exposure by `delta_usd`. Called when a fill arrives — before we've hedged it, we are exposed to that amount of risk. Creates the row if it doesn't exist yet.

#### `exposure_decrement(market_id, delta_usd)`

Decreases the unhedged exposure. Called after a hedge fills — we've neutralised that much risk.

#### `exposure_set_paused(market_id, paused)`

Marks a market as paused (`true`) or unpaused (`false`). When a hedge permanently fails, the market gets paused to stop accepting new orders until someone investigates. Ops sets it back to `false` once the issue is fixed.

---

## 5. Ingestion Pipeline

This is the "watcher" — it monitors Solana for new trades and hands them to the hedger.

---

### `ingest/index.ts` — `FillIngester`

The main pipeline. Composes the decoder, cursor, listener, and poller together. From outside this module, this is the only class you interact with.

#### `constructor(solana, on_fill, health)`

Stores the Solana client, the callback to call when a fill is found, and the health server. Creates the cursor and decoder internally.

#### `start()`

1. Loads the cursor from the database (so we know where we left off).
2. Creates and starts the listener (websocket).
3. Creates and starts the poller (periodic scan).

#### `stop()`

Stops the poller first, then the listener (websocket).

---

### `ingest/listener.ts` — `Listener`

Watches Solana in **real-time** using a websocket subscription. When a transaction involving our program is confirmed, we immediately decode it and hand any fills to the hedger. This is the fast path — fills are processed within milliseconds of appearing on-chain.

Important: the listener does **not** update the cursor (checkpoint). That's the poller's job. If we see the same fill via both the listener and the poller later, the queue's dedupe logic handles it safely.

#### `start()`

Opens the websocket subscription to Solana's `onLogs` for our program.

#### `stop()`

Closes the websocket and cancels any pending reconnect timer. Safe to call multiple times.

**Private methods:**

#### `subscribe()`

Actually opens the `onLogs` subscription. If it fails (e.g. RPC is down), schedules a reconnect instead of crashing. On success, records in the database that we're live-connected.

#### `handle_logs(logs, slot)`

Called every time Solana sends us a transaction notification. Filters out failed transactions and empty payloads. Decodes the logs and calls `on_fill` for each fill found. Errors from `on_fill` are caught and logged — one bad fill can't kill the whole subscription.

#### `schedule_reconnect()`

Sets a timer to reconnect after `HEDGER_LIVE_LISTENER_RECONNECT_MS`. Coalescing — if called twice before the timer fires, only one reconnect is scheduled.

---

### `ingest/poller.ts` — `Poller`

Periodically scans Solana's transaction history and replays any transactions we missed. This is the **catch-up** path — slower than the listener (runs every 10 seconds by default) but guarantees we don't miss anything if the websocket drops.

Single-flight: if the previous tick hasn't finished (e.g. RPC is slow), the next tick is skipped rather than running in parallel.

#### `start()`

Runs one tick immediately (so we catch up right away after a restart), then schedules periodic ticks.

#### `stop()`

Cancels the interval. Any currently running tick finishes naturally.

**Private methods:**

#### `tick()`

Wrapper that enforces single-flight with the `running` flag. Always updates "last run time" in the database at the end (even on error) so ops can tell if the poller is stuck vs just slow.

#### `run_once()`

Fetches all signatures newer than our cursor checkpoint, reverses them to chronological order, and processes each one.

#### `fetch_new_signatures(until)`

Calls Solana's `getSignaturesForAddress` API to get recent transactions for our program. `until` is the cursor — we only fetch transactions newer than the last one we processed.

#### `finality()`

Maps the configured commitment level to a valid `Finality` value. "processed" gets downgraded to "confirmed" because `getTransaction` doesn't accept "processed".

#### `process_signature(sig)`

For a single transaction:

1. If it failed on-chain, skip decoding but still advance the cursor past it.
2. Fetch the full transaction and decode its logs.
3. Call `on_fill` for each fill found.
4. Advance the cursor to this transaction's slot + signature.

The cursor advances **after** dispatching to `on_fill`, not before. This ensures at-least-once delivery — if `on_fill` crashes, the cursor stays back and we'll retry on next boot.

---

### `ingest/cursor.ts` — `Cursor`

The "bookmark" that remembers where we are on the Solana chain. Stored in the database so it survives restarts.

#### `load()`

Reads the cursor from the database on startup. Creates the row if it doesn't exist (first boot). Must be called before any other cursor method.

#### `get_slot()`

Returns the last Solana slot number we successfully processed, or `null` if we've never processed anything.

#### `get_signature()`

Returns the last transaction signature we successfully processed, or `null`.

#### `advance(slot, signature)`

Moves the cursor forward to a new slot + signature. **Monotonic guard**: if the new slot is not strictly greater than the current one, this is a no-op. This makes it safe for both the listener and poller to call `advance` without worrying about one going backwards.

#### `mark_live_connected()`

Records in the database that the websocket subscription just succeeded. Also clears the "disconnected at" timestamp so the row shows we're currently connected.

#### `mark_live_disconnected()`

Records that the websocket dropped. Keeps the "connected at" timestamp intact (as a historical record of when the session started).

#### `mark_poller_run()`

Stamps the database with "the poller just ran at this time". Used as a liveness check — if this timestamp is very old, the poller is stuck.

---

### `ingest/decoder.ts` — `OrderFilledDecoder`

Converts raw Solana transaction logs into clean, typed `OrderFilledEvent` objects. No network calls — pure data transformation.

#### `constructor(solana)`

Sets up the Anchor event parser using the program's IDL (the ABI/schema of our smart contract).

#### `decode_logs(logs)`

Given an array of raw log strings from a Solana transaction, returns all `OrderFilled` events found. Silently skips logs that aren't Anchor events or are a different event type. Silently drops any malformed events rather than crashing — one bad log line shouldn't stop the valid ones from being processed.

**Private methods:**

#### `normalize(data)`

Converts Anchor's loosely-typed event data into our strict `OrderFilledEvent` type. Returns `null` if anything is wrong (wrong types, missing fields). The `decode_logs` caller drops nulls.

#### `coerce_nonce(input)`

The nonce (unique ID for a fill) can come back from Anchor as a `Buffer`, `Uint8Array`, or plain `number[]` depending on the Anchor version. This method handles all three and returns a `Buffer`.

#### `coerce_bigint(input)`

The fill size can come back as a `bigint`, `number`, `string`, or a BN.js object (all equivalent types for large integers). This method accepts all of them and returns a native `bigint`.

---

## 6. Hedger Core

---

### `hedger/types.ts`

Defines the shapes of queue job data.

**`HedgeJobData`** — the payload stored in the BullMQ queue for each fill. Contains all fill details (user, market, side, outcome, size, price, nonce) plus metadata (which source found it, what Solana slot, when it was enqueued).

**`HedgeJobResult`** — what the worker reports back when a job finishes:

- `FILLED` — fully hedged ✓
- `PARTIAL` — partially hedged (hit slippage limit)
- `FAILED` — couldn't hedge
- `SKIPPED` — already hedged (duplicate job)

---

### `hedger/index.ts` — `Hedger`

Manages the entire hedge job lifecycle: queue, worker, failure handling, and boot recovery. What used to be 5 separate classes in v1 is one class here because they all manage different aspects of the same thing.

#### `constructor(solana, poly, hedges, markets, users)`

Creates the BullMQ queue immediately (so `on_fill` can be called even before `start()` completes). Configures retry settings from environment variables.

#### `start()`

1. Runs **boot recovery** (fix anything broken from a crash).
2. Starts the **worker** (begins pulling jobs from the queue).
3. Attaches **queue event listeners** (watches for permanent failures).

#### `stop()`

Force-closes the worker (doesn't wait for in-flight jobs to finish — boot recovery handles them on next start), closes the events listener, closes the queue.

#### `on_fill(event, ctx)` ← **main entry point**

Called by `FillIngester` every time a fill is detected on Solana. Creates a BullMQ job with the fill nonce as the job ID. Because job IDs are unique in BullMQ, if the same fill is seen twice (e.g. via both listener and poller), the second enqueue is a silent no-op. This is the free deduplication.

**Private — Worker:**

#### `attach_worker()`

Creates the BullMQ worker that pulls jobs and calls `processor.handle()`. Sets concurrency (how many hedges run in parallel) and rate limiting (max orders per second) from environment variables.

#### `build_payload(event, ctx)`

Converts an `OrderFilledEvent` into the serialisable `HedgeJobData` format. Solana `PublicKey` objects → base58 strings, `bigint` → string.

#### `is_shutdown_noise(err)`

During shutdown, BullMQ throws connection errors as the socket tears down. This method returns `true` for those expected errors so they don't pollute the logs.

**Private — Auto-pause on permanent failure:**

#### `on_permanent_failure(job_id, reason)`

Called when BullMQ gives up on a job after all retries are exhausted. Marks the hedge as `FAILED` in the database and tries to pause the market on-chain to stop more fills from coming in until someone investigates.

#### `mark_hedge_failed(job_id, reason)`

Finds the hedge by job ID and marks it `FAILED`. Skips if already `FAILED` (idempotent).

#### `maybe_pause_market(job_id, reason)`

If the admin keypair is configured, pauses the market on Solana. If not configured, logs a one-time warning and skips. The pause prevents new orders from being accepted until ops manually unpauses.

#### `lookup_pause_context(job_id)`

Follows the chain: `job_id → Hedge → Fill → Market` to find the Solana market PDA. Returns `null` if any link is broken.

#### `pause_market_on_chain(market_pda)`

Submits the `adminPauseMarket` transaction to Solana using the admin keypair.

#### `get_admin_client()`

Creates the `SolmarketClient` (our Solana smart contract client) the first time it's needed. Uses a separate connection from the listener.

#### `get_admin_keypair()`

Parses the admin keypair from the environment variable the first time it's needed.

#### `load_keypair(encoded)`

Accepts a keypair in two formats: JSON byte array `[1,2,3,...]` (Solana CLI format) or base58 string.

**Private — Boot recovery:**

#### `recover_in_flight()`

Runs on every startup. Calls the two recovery sub-tasks. Errors are logged but don't block startup.

#### `recover_stuck_hedging()`

Finds all hedges left in `HEDGING` status from a previous crash (the process died while placing a Polymarket order). Resets them to `PENDING` so BullMQ will retry them. Without this, they'd be stuck in `HEDGING` forever.

#### `rebuild_exposure_drift_check()`

Recalculates what the exposure should be for each market by summing up all fills that haven't been fully hedged yet. Compares that against the stored `Exposure.unhedgedUsd`. If there's a discrepancy > $1 (meaning the crash caused inconsistency), it overwrites the stored value with the correct one.

#### `compute_expected_exposure()`

Calculates the expected exposure per market from scratch. Returns a `Map<marketId, amount>` where the amount is the sum of fill sizes for all fills whose hedge isn't yet terminal (FILLED/PARTIAL/FAILED).

#### `is_hedge_terminal(status)`

Returns `true` if the hedge status is `FILLED`, `PARTIAL`, or `FAILED` — meaning we're done with it.

#### `reconcile_one_exposure(exposure, recomputed)`

Compares stored exposure to the recomputed value. If the difference is > $1, logs a warning and overwrites the stored value.

---

### `hedger/processor.ts` — `HedgeProcessor`

Does the actual work for each queue job: translates the fill into a Polymarket order and executes it. Called once per job dequeue.

#### `constructor(poly, hedges, markets, users)`

Stores references to all the things it needs to do its job.

#### `handle(job)` ← **worker entry point**

Main method — called by the BullMQ worker for each job:

1. **Resolve context** — look up the user, market, fill, and hedge from the database.
2. **Check if already done** — if the hedge is already `FILLED/PARTIAL/FAILED`, return `SKIPPED` (prevents double-execution after a crash).
3. **Mark as in-progress** — update status to `HEDGING`.
4. **Increment exposure** — on the first attempt, record that we now have unhedged risk.
5. **Execute** — place the order on Polymarket.

**Private — Context resolution:**

#### `resolve_context(job)`

Inflates the job payload into rich domain objects. Creates fill and hedge rows in the database if they don't exist yet (idempotent).

#### `lookup_user(pubkey)`

Calls `UserRepo` to find the user. Throws `RetryableError` if not found (the row may not have replicated yet).

#### `lookup_market(pda)`

Calls `MarketRepo` to find the market by its Solana PDA. Throws `RetryableError` if not found.

#### `upsert_fill(data, user_id, market_id)`

Inserts the fill into the database (or returns existing if duplicate).

#### `upsert_hedge(fill_id, job_id, direction, size)`

Inserts the hedge into the database (or returns existing if duplicate). The `clientOrderId` is `hedger-{job_id}` — a unique ID used to deduplicate orders on Polymarket's side.

#### `is_terminal(hedge)`

Returns `true` if the hedge is already `FILLED`, `PARTIAL`, or `FAILED`.

**Private — Direction picker:**

#### `pick_direction(input)`

Figures out what to buy/sell on Polymarket to offset the Solana fill.

The mapping is simple:

- User bought YES on Solana → we buy YES on Polymarket (so we profit if YES wins too)
- User sold YES on Solana → we sell YES on Polymarket
- Same logic for NO

Selects the correct Polymarket token ID based on whether it's a YES or NO outcome.

**Private — Execution:**

#### `execute_hedge(ctx)`

Gets the current best price from the Polymarket order book, then places the initial order. If it fully fills → done. If partial → walk the book for the rest.

#### `announce_hedge_attempt(ctx, target_price)`

Logs the details of what we're about to do — useful for debugging when something goes wrong.

#### `target_price_cents(ctx)`

Picks the price to use for the order:

- If buying → use the best ask (lowest price someone is selling at)
- If selling → use the best bid (highest price someone is buying at)
- Falls back to the user's original fill price if the book fetch fails.

**Private — Walk-book:**

#### `walk_book(input)`

If the initial order didn't fill everything, this steps through the order book to fill the rest. It moves the price 1 cent at a time (up if buying, down if selling) and places a new order at each level until either:

- All shares are filled, OR
- The slippage limit (`HEDGER_SLIPPAGE_LIMIT_CENTS`, default 2¢) is reached.

Each step uses a unique order ID suffix (`-walk-1`, `-walk-2`, etc.) so Polymarket doesn't treat them as duplicates.

#### `merge_walk_result(acc, result)`

Adds the results of one walk step into the running total (shares filled, USDC spent).

#### `price_outside_budget(side, current, max)`

Checks if the current price has exceeded our slippage budget. BUY: stops when `current > max`. SELL: stops when `current < max`.

**Private — Finalize:**

#### `finalize_filled(ctx, result)`

The order fully filled. Marks the hedge `FILLED`, decrements exposure (risk neutralised), returns success result.

#### `finalize_partial(ctx, initial, target_price)`

The initial order only partially filled. Runs `walk_book` to try to fill the rest. If walk fills everything → marks `FILLED`. If still partial → marks `PARTIAL`, decrements whatever exposure we did cover, logs a warning.

#### `combined_avg(a_filled, a_avg, b_filled, b_avg)`

Calculates the weighted average price across the initial fill and any walk-book fills. For reporting purposes only.

#### `side_from(raw)`

Converts `0 → "BUY"`, `1 → "SELL"`.

#### `outcome_from(raw)`

Converts `0 → "YES"`, `1 → "NO"`.

---

## 7. Resolver — `resolver/index.ts`

Runs on a timer (every 60 seconds by default). When a prediction market ends, this service detects the result and handles the three-step resolution process.

**The 3 stages per tick:**

1. **Detect** — ask Polymarket "has this market resolved, and who won?"
2. **Submit on Solana** — once we're sure the result is final (after a 48-hour dispute window), submit it on-chain so users can claim their winnings.
3. **Redeem on Polygon** — call the Polygon CTF contract to get our USDC back from Polymarket.

Single-flight: if the previous tick is still running, the next one is skipped.

#### `start()`

Runs a tick immediately, then schedules periodic ticks.

#### `stop()`

Cancels the periodic timer.

**Private — Stage 1: Detect**

#### `tick()`

Runs all three stages. Each stage is wrapped in a try-catch so a failure in one doesn't block the others.

#### `detect_polymarket_resolutions()`

Gets the list of markets to check and calls `check_one` for each.

#### `list_pending_candidates()`

Returns markets that:

- Have a Solana PDA (deployed on-chain), AND
- Haven't yet reached a post-resolution stage (`POLYMARKET_RESOLVED`, `SOLANA_RESOLVED`, or `REDEEMED`)

#### `is_terminal_stage(stage)`

Returns `true` for the three stages after resolution starts.

#### `check_one(candidate)`

Fetches the Polymarket resolution for one market. Skips if not closed or winner is ambiguous. Records the resolution if a clear winner exists.

#### `record_resolution(candidate, resolution)`

Writes `POLYMARKET_RESOLVED` to the database with the winning outcome and timestamp. Skips if already recorded (idempotent).

**Private — Stage 2: Submit on Solana**

#### `submit_solana_for_resolved()`

Skips if `HEDGER_SOLANA_ORACLE_SIGNER_KEYPAIR` is not set (logs once). Gets all markets past the dispute window and submits each.

#### `dispute_window_cutoff()`

Calculates `now - 48 hours` (configurable). Only resolutions older than this are forwarded to Solana — gives time for UMA disputes to resolve before we commit on-chain.

#### `submit_one(row)`

For one market: validates the PDA and winning outcome are set, submits `resolve_market` on Solana, records the transaction signature.

#### `send_resolve_to_solana(market_pda, winning_outcome)`

Calls `SolmarketClient.resolveMarket` with the oracle's keypair.

**Private — Stage 3: Redeem on Polygon**

#### `redeem_polygon_for_resolved()`

Skips if Polygon is not configured. Gets all markets that are `SOLANA_RESOLVED` but not yet redeemed, and redeems each.

#### `redeem_one(row)`

Fetches the market's Polymarket ID and calls `poly.redeem_positions`.

#### `handle_redeem_outcome(...)`

Routes the result:

- `submitted` → record as `REDEEMED` with the tx hash
- `skipped_neg_risk` or `skipped_no_condition_id` → write a note and warn (manual action needed)
- `skipped_not_resolved` → do nothing, will retry next tick

**Private — Oracle client:**

#### `get_oracle_client()`

Lazily creates the `SolmarketClient` signed by the oracle keypair. Separate from the admin client in `Hedger` because they use different keypairs for different purposes (oracle signs resolutions, admin pauses markets).

#### `get_oracle_keypair()`

Parses the oracle keypair from env on first use.

#### `load_keypair(encoded)`

Accepts JSON byte array or base58 string format.

---

## 8. Reconciler — `reconcile/index.ts`

A periodic safety check (every 60 seconds). Watches for things that shouldn't happen but might — like Polymarket reversing a resolution mid-dispute, or a hedge getting stuck and never finishing.

**The 2 checks per tick:**

1. **UMA dispute reversal** — if a market we recorded as resolved is no longer resolved on Polymarket (someone filed a UMA challenge), revert our state so we don't submit an incorrect result on-chain.
2. **Stuck hedges** — flag hedges that have been "in progress" for more than 5 minutes (something probably went wrong).

#### `start()`

Schedules the periodic interval (no immediate first tick).

#### `stop()`

Cancels the timer.

**Private:**

#### `tick()`

Single-flight wrapper. Runs both checks.

#### `detect_uma_dispute_reversal()`

Gets all markets in `POLYMARKET_RESOLVED` that haven't been submitted to Solana yet. Re-checks each one against live Polymarket data.

#### `recheck_one(market_id, prior_outcome)`

Re-fetches the Gamma resolution for one market. Two scenarios:

- **Now shows unclosed/ambiguous** → `handle_dispute_reversal`
- **Still closed but different winner** → `handle_outcome_flip`

#### `handle_dispute_reversal(market_id, polymarket_id)`

Resets the market's resolver state back to `PENDING` and clears the winning outcome. Logs a big warning. This stops us from forwarding a now-incorrect result to Solana.

#### `handle_outcome_flip(market_id, polymarket_id, prior, live)`

Updates the stored winning outcome to the new value. Logs a warning.

#### `detect_stuck_hedges()`

Finds hedges that have been in `HEDGING` status for more than 5 minutes and logs a warning for each. Currently log-only — ops has to manually investigate. (Future: could automatically re-enqueue them.)

---

## 9. Infrastructure

### `envs/env.ts`

All configuration comes from environment variables. Zod validates them all at startup — if anything is missing or the wrong type, the process exits immediately with a clear error. Once loaded, the `ENV` object is frozen and available everywhere.

**Groups of settings:**

| Group            | Examples                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------- |
| Database & Redis | `DATABASE_URL`, `HEDGER_REDIS_URL`                                                       |
| Solana           | RPC URL, WebSocket URL, program ID, commitment level                                     |
| Signers          | Admin keypair (for pausing), oracle keypair (for resolving)                              |
| Polymarket       | REST URL, Gamma URL, API key/secret, private key                                         |
| Polygon          | RPC URL (for redemptions)                                                                |
| Ingester         | Poller interval (10s), reconnect delay (2s), max backfill signatures (1000)              |
| Hedger queue     | Max attempts (5), backoff (500ms), concurrency (5), rate limit (30/s), slippage cap (2¢) |
| Resolver         | Poll interval (60s), dispute window (48h)                                                |
| Reconciler       | Poll interval (60s)                                                                      |
| Health           | Port (4001), offline grace period (120s)                                                 |

---

### `health.ts` — `HealthServer`

A tiny HTTP server that answers `/healthz`. Used by the orchestrator (e.g. Kubernetes) to know if the hedger is healthy.

Reports **healthy (200)** only when:

- The websocket subscription is currently connected, AND
- We've seen at least one fill in the last `HEDGER_OFFLINE_GRACE_PERIOD_SEC` seconds (default 120s).

Reports **unhealthy (503)** otherwise.

#### `mark_event()`

Called by the listener and poller every time a fill is decoded. Updates the "last seen fill" timestamp.

#### `mark_live(state)`

Called by the listener. `true` when the websocket connects, `false` when it disconnects or is reconnecting.

#### `start()`

Starts the `Bun.serve` HTTP server on `HEDGER_HEALTH_PORT`. Idempotent — calling twice is a no-op.

#### `stop()`

Stops the HTTP server.

---

### `redis.ts`

#### `make_redis_options()`

Returns the Redis connection config for BullMQ. Reads `HEDGER_REDIS_URL` and optionally enables TLS. All queue-related classes (`Queue`, `Worker`, `QueueEvents`) use this to get a consistent connection.

---

### `log/log.ts`

#### `logger_for(category)`

Creates a Pino logger with the log level from `ENV.HEDGER_LOG_LEVEL` and the given category name bound to every log line. Every class calls this once to get its own named logger, so you can tell from logs which component emitted what.

---

### `errors.ts`

Two custom error types that drive BullMQ's retry behavior:

**`RetryableError`** — "something went wrong but might succeed if we try again later." Causes BullMQ to retry the job with exponential backoff. Examples: database replication lag, Polymarket 5xx, network blip.

**`UnrecoverableError`** — "something is fundamentally wrong that retrying won't fix." Causes BullMQ to immediately move the job to the failed set. Examples: invalid API credentials, account blocked, bad token ID.

---

## How it all flows together

---

### Boot sequence (how everything wires up)

```
process starts
     │
     ▼
env.ts validates all environment variables
     │  (crashes here if anything is missing or wrong)
     ▼
init_services()
     │  builds objects in topological order — nothing starts yet
     │
     ├── new SolanaClient()          → opens Solana RPC connection
     ├── new PolymarketClient()       → lazy (no network yet)
     ├── new UserRepo()               → wraps Prisma (no network yet)
     ├── new MarketRepo()             → wraps Prisma
     ├── new HedgeRepo()              → wraps Prisma
     ├── new HealthServer()           → no port bound yet
     ├── new Hedger(solana, poly, hedges, markets, users)
     │        └── creates BullMQ Queue (connects to Redis)
     ├── new FillIngester(solana, hedger.on_fill, health)
     │        └── creates Cursor + OrderFilledDecoder
     ├── new Resolver(solana, poly, markets, hedges)
     └── new Reconciler(hedger, poly, markets, hedges)
     │
     ▼
start_services()
     │
     ├── hedger.start()
     │     ├── recover_in_flight()
     │     │     ├── reset stuck HEDGING rows → back to PENDING
     │     │     └── recompute exposure drift → fix any inconsistency
     │     ├── attach_worker()        → BullMQ Worker starts pulling jobs
     │     └── attach_queue_events()  → listens for permanent failures
     │
     ├── ingester.start()
     │     ├── cursor.load()          → read last checkpoint from DB
     │     ├── listener.start()
     │     │     └── subscribe()      → websocket connected to Solana
     │     └── poller.start()         → first tick fires immediately
     │
     ├── resolver.start()             → first tick fires immediately
     ├── reconciler.start()           → periodic timer scheduled
     └── health.start()               → /healthz now answering on port 4001
     │
     ▼
System is live. Waiting for events.
```

---

### Fill lifecycle (the hot path)

This is what happens every time a user makes a trade on Solana.

```
User buys YES on Solana
         │
         ▼
  [Solana emits OrderFilled event in transaction logs]
         │
         ├──── Listener (websocket, ~instant)
         │           │
         │     handle_logs()
         │     decode_logs()   → OrderFilledEvent
         │           │
         │     hedger.on_fill(event, { source: "live" })
         │
         └──── Poller (HTTP scan, every 10s — catches missed events)
                     │
               process_signature()
               decode_logs()      → OrderFilledEvent
                     │
               hedger.on_fill(event, { source: "poller" })
                     │
         ┌───────────┘
         │
         ▼
  Hedger.on_fill()
     │  job_id = event.nonce (hex)
     │  if job already exists in Redis → skip (free dedup)
     │  else → add to BullMQ queue
         │
         ▼
  [Job sits in Redis queue]
         │
         ▼
  HedgeProcessor.handle(job)       ← worker pulls the job
     │
     ├── lookup_user(pubkey)        → find user in DB
     ├── lookup_market(pda)         → find market + Polymarket token IDs
     ├── upsert_fill()              → insert Fill row (idempotent)
     ├── pick_direction()           → decide: buy or sell which token
     ├── upsert_hedge()             → insert Hedge row (idempotent)
     │
     ├── [if hedge already FILLED/PARTIAL/FAILED] → return SKIPPED
     │
     ├── hedge_mark_hedging()       → status = HEDGING
     ├── exposure_increment()       → we're now exposed by fill.size USD
     │
     ├── get_top_of_book()          → what's the best price right now?
     │
     ▼
  poly.place_market_order()         → place FAK order on Polymarket
     │
     ├── [fully filled]
     │     hedge_mark_filled()
     │     exposure_decrement()     → risk neutralised
     │     return FILLED ✓
     │
     └── [partially filled]
           walk_book()              → step price 1¢ at a time, retry
                 │
                 ├── [eventually fully filled]
                 │     hedge_mark_filled()
                 │     exposure_decrement()
                 │     return FILLED ✓
                 │
                 └── [hit slippage limit (2¢ cap)]
                       hedge_mark_partial()
                       exposure_decrement() for what we did fill
                       return PARTIAL ⚠
```

---

### Market resolution lifecycle (after a market ends)

This runs on the Resolver's timer — completely independent of fills.

```
Market exists: PENDING
     │
     ▼
Resolver tick (every 60s)
     │
     ├── Stage 1: Detect
     │     poly.fetch_resolution(polyMarketId)
     │     Is it closed? Is there a clear winner?
     │       Yes → resolver_record_polymarket_resolved()
     │             status: POLYMARKET_RESOLVED, winningOutcome saved
     │
     ├── Stage 2: Submit on Solana
     │     Is polymarketResolvedAt older than 48 hours?
     │       Yes → send_resolve_to_solana()
     │             resolver_record_solana_resolved()
     │             status: SOLANA_RESOLVED, tx signature saved
     │             (users can now claim winnings on Solana)
     │
     └── Stage 3: Redeem on Polygon
           poly.redeem_positions(polyMarketId)
           → calls redeemPositions() on Polygon CTF contract
           → USDC.e flows back to our wallet
           resolver_record_redeemed()
           status: REDEEMED ✓


Meanwhile — Reconciler (every 60s) watches for problems:

  POLYMARKET_RESOLVED (not yet on Solana)
       │
       ├── Re-check Gamma: still closed + same winner?
       │       No → UMA dispute! Reset to PENDING, clear outcome
       │       Different winner → update winningOutcome, log warning
       │
       └── Any hedges stuck in HEDGING > 5 min?
               Yes → log warning (manual ops action needed)
```

---

### Permanent failure / auto-pause flow

What happens when a hedge completely fails (all retries exhausted).

```
HedgeProcessor.handle() keeps throwing
     │  (retried 5 times with exponential backoff)
     ▼
BullMQ declares the job permanently failed
     │
     ▼
QueueEvents.on("failed") fires
     │
     ▼
Hedger.on_permanent_failure(job_id, reason)
     │
     ├── mark_hedge_failed()        → Hedge status = FAILED in DB
     │
     └── maybe_pause_market()
           │
           ├── lookup_pause_context()
           │     job_id → Hedge → Fill → Market → solanaMarketPda
           │
           ├── pause_market_on_chain(pda)
           │     → submits adminPauseMarket tx to Solana
           │     → no new orders accepted on this market
           │
           └── exposure_set_paused(marketId, true)
                 → DB records that this market is paused
                 → ops must manually investigate + unpause
```

---

### Shutdown sequence

```
SIGTERM received
     │
     ▼
shutdown()
     │
     ├── sets shutting_down = true
     ├── starts 4-second hard cap timer
     │
     └── stop_services()
           ├── resolver.stop()     → cancel resolution timer
           ├── reconciler.stop()   → cancel reconcile timer
           ├── ingester.stop()
           │     ├── poller.stop()   → cancel poller interval
           │     └── listener.stop() → close websocket
           ├── hedger.stop()
           │     ├── worker.close(force=true)  → don't wait for in-flight jobs
           │     ├── events.close()
           │     └── queue.close()
           └── health.stop()       → stop HTTP server
     │
     ▼
process.exit(0)
     (boot recovery on next start handles anything mid-flight)
```
