# End-to-End Use Case Walkthrough

Picking one concrete market and tracing every step from "market appears on our platform" to "user gets paid out" — including the unhappy paths.

---

## The example market

> **"Will Bitcoin close above $150,000 on December 31, 2026?"**

This market already exists on Polymarket. Let's say its state at the moment we list it:

- **Polymarket market ID:** `0xabc...` (on Polygon)
- **YES token ID:** `7283...` (ERC-1155 conditional token)
- **NO token ID:** `9174...`
- **Current order book on Polymarket:**
  - Best YES ask: **50¢** (size: 10,000 shares)
  - Best YES bid: **49¢** (size: 8,000 shares)
- **Tick size:** `0.01`
- **Resolution source:** Polymarket's UMA optimistic oracle, final on 2027-01-01.

Our platform: **"SolMarket"** on Solana. We're using Solana USDC.

**Our configuration:**

- Spread: **1 cent on each side** (we buy 1¢ below, sell 1¢ above Polymarket's best)
- Max unhedged delta per market: **$500**
- We have pre-funded USDC on both Solana and Polygon ($5,000 each to start)

---

## Actors in the system

1. **Alice** — a Solana user with Phantom wallet and some USDC on Solana.
2. **SolMarket Solana program** — our on-chain Anchor program.
3. **Mirror service** — our off-chain backend that reads Polymarket's book.
4. **Hedging bot** — our off-chain backend that places offsetting orders on Polymarket.
5. **Polymarket CLOB** — external, on Polygon.
6. **Our Polygon wallet** — holds USDC on Polygon, executes hedges.
7. **Our Solana treasury PDA** — holds USDC on Solana, pays out users.
8. **Oracle signer** — a trusted key we control that posts Polymarket resolution back to Solana.

---

## Phase 1 — Listing the market

### Step 1.1 — Mirror service discovers the market

- The mirror service polls Polymarket's **Gamma Markets API** every few minutes.
- It finds the BTC $150k market. It reads: `tokenID`, `tickSize`, `negRisk`, `end_date_iso`, `question`.
- It stores these in our database.

### Step 1.2 — Mirror service opens WebSocket subscriptions

- Opens a connection to `wss://clob.polymarket.com`.
- Subscribes to the `market` channel for both YES and NO `tokenID`s.
- Starts receiving live `book`, `price_change`, and `last_trade_price` events.

### Step 1.3 — We create the market on Solana

- An admin (us) calls a `create_market` instruction on the Solana program.
- Arguments: `polymarket_market_id`, `question`, `end_time`, `tick_size`, `yes_token_id`, `no_token_id`.
- The program creates a `Market` PDA account on Solana, initialized with:
  - Zero YES shares outstanding, zero NO shares outstanding.
  - A linked USDC vault PDA (empty until users fund positions).
  - Status: `Open`.
- The market now exists on Solana but has zero on-chain liquidity.

### Step 1.4 — Front-end shows the market

- Our Next.js frontend queries two things to render the market page:
  - The Solana `Market` PDA (question, status, end time).
  - The mirror service's live quote: "best YES ask 51¢ / best YES bid 48¢" (Polymarket's 50/49 + our 1¢ spread).
- Alice opens the page and sees: _"BTC > $150k by 2026 — YES 51¢ / NO 50¢"_. From her point of view, the book looks real and deep.

---

## Phase 2 — Alice places an order (happy path)

### Step 2.1 — Alice clicks "Buy 100 YES at 51¢"

- The frontend shows: "Cost: 100 × $0.51 = $51.00 USDC. Potential payout if YES wins: $100."
- Alice confirms.

### Step 2.2 — Frontend requests a signed quote from our backend

- The frontend calls our backend: `POST /quote { marketId, side: BUY, outcome: YES, size: 100 }`.
- The backend:
  - Re-reads the current Polymarket top of book from its local mirror: best ask is still 50¢.
  - Computes our quote: **51¢**.
  - Checks unhedged inventory for this market (currently $0, under the $500 cap).
  - **Signs the quote** with our backend's ed25519 key: `{ marketId, side, outcome, price: 51, size: 100, expires_at: now + 5s, signature }`.
  - Returns it to the frontend.
- The 5-second expiry bounds how much Polymarket can move before Alice acts.

### Step 2.3 — Alice submits the Solana transaction

- The frontend builds a Solana transaction calling our program's `place_order` instruction.
- Arguments: the signed quote + Alice's USDC token account.
- The transaction is signed by Alice's wallet and sent to a Solana RPC.

### Step 2.4 — Solana program executes `place_order`

Inside the `place_order` instruction, the program does **all** of this atomically:

1. **Verify the quote signature** against our backend's known public key (stored in a `Config` account).
2. **Check `expires_at`** against the current Solana clock. Reject if expired.
3. **Transfer 51 USDC** from Alice's token account into the market's vault PDA.
4. **Mint 100 YES shares** to a `UserPosition` PDA owned by Alice (specific to this market).
5. **Increment the market's outstanding YES supply** by 100.
6. **Emit an event** `OrderFilled { user: Alice, market, outcome: YES, size: 100, price: 51 }`.

At this point, **from Alice's perspective the trade is done**. She owns 100 YES shares. If BTC > $150k, she gets $100. If not, she gets $0.

### Step 2.5 — Hedging bot sees the event

- The hedging bot is subscribed to our Solana program's logs (via Solana WebSocket `logsSubscribe` or Helius/Triton).
- It catches the `OrderFilled` event within ~1 second of the Solana slot confirming.
- It immediately computes the hedge needed:
  - Alice bought **100 YES at 51¢** from us.
  - Our short exposure: we owe 100 YES.
  - To neutralize: **buy 100 YES on Polymarket**.

### Step 2.6 — Hedging bot places the hedge order

The bot uses `@polymarket/clob-client`:

```ts
await clobClient.createAndPostOrder(
  { tokenID: YES_TOKEN, price: 0.5, side: Side.BUY, size: 100 },
  { tickSize: "0.01", negRisk: false },
  OrderType.GTC,
);
```

### Step 2.7 — Polymarket fills the hedge

- Polymarket matches our order against its resting book.
- Fills 100 shares at 50¢. We pay **$50 in Polygon USDC** from our Polygon wallet.
- We receive **100 YES ERC-1155 tokens** on Polygon, held by our Polymarket account.

### Step 2.8 — Reconciliation

- The bot records in our database:
  - Alice's Solana fill: **sold 100 YES @ 51¢** → received $51.
  - Our Polymarket fill: **bought 100 YES @ 50¢** → paid $50.
  - **Realized spread profit: $1.**
  - Net YES exposure for this market: **0** (short 100 on Solana, long 100 on Polygon).

**Everything is balanced. The happy path is complete.**

---

## Phase 3 — Market resolves

Fast-forward to 2027-01-01. BTC closed at $162k on Dec 31. YES wins.

### Step 3.1 — Polymarket resolves on Polygon

- Polymarket's UMA oracle posts the outcome on-chain on Polygon.
- Our 100 YES ERC-1155 tokens on Polygon become redeemable for **100 USDC**.
- The hedging bot detects the resolution (via Polymarket API or by watching the conditional tokens contract).
- It calls `redeem` and our Polygon wallet USDC balance goes up by $100. (We had paid $50 for them → $50 profit on the hedge leg.)

### Step 3.2 — Oracle signer posts the resolution to Solana

- Our backend's oracle signer calls the Solana program's `resolve_market` instruction with `outcome: YES`.
- The program marks the `Market` PDA as `Resolved { winning_side: YES }`.
- No automatic payouts yet — users claim individually.

### Step 3.3 — Alice claims her payout

- Alice visits the page, sees "YES won. Claim 100 USDC."
- She clicks Claim. The frontend sends a `claim` transaction.
- The Solana program:
  - Verifies Alice holds 100 YES shares in her `UserPosition` PDA for this resolved market.
  - Transfers **100 USDC** from the market vault → Alice's token account.
  - Burns her 100 YES shares.

### Step 3.4 — Accounting for this trade, end to end

| Leg                          | Cash flow                     |
| ---------------------------- | ----------------------------- |
| Alice → us (Solana)          | +$51 (she bought YES from us) |
| Us → Alice (Solana, payout)  | −$100                         |
| Us → Polymarket (hedge buy)  | −$50                          |
| Polymarket → us (redemption) | +$100                         |
| **Net**                      | **+$1**                       |

We made exactly the spread. Alice made $49 on her bet. Polymarket did its job. Everyone's happy.

---

## Phase 4 — The unhappy paths

This is where the real engineering lives.

### Case A — Quote expires before Alice confirms

- Alice sits on the confirm screen for 10 seconds. Quote's 5s expiry passes.
- Solana program rejects the transaction with `QuoteExpired`.
- Frontend automatically re-requests a fresh quote and shows Alice the new price (which may have moved).
- **No harm done.** This is the normal drift-protection behavior.

### Case B — Polymarket moves between quote and Solana fill

- Alice gets a quote at 51¢ (Polymarket was 50¢).
- In the 2 seconds before her Solana tx lands, someone on Polymarket buys aggressively and the new ask is 55¢.
- Our Solana tx **still fills** at 51¢ — we honor the signed quote.
- The hedging bot now has to buy 100 YES at 55¢ instead of 50¢.
- **We lose $4** on this trade (received $51, paid $55).
- This is the risk the spread is supposed to cushion; it didn't fully cover this move.
- **Mitigations we need:**
  - Dynamic spread: widen the spread when Polymarket volatility is high.
  - Shorter quote expiry (2s instead of 5s) for volatile markets.
  - Inventory cap: if this pushes us past $500 unhedged delta, stop quoting this market.

### Case C — Polymarket hedge order only partially fills

- Bot places a buy for 100 YES at 50¢.
- The Polymarket book only had 60 shares at 50¢; the next level is 53¢.
- Options:
  1. **Walk the book:** place a follow-up order at 53¢ for the remaining 40 shares. We accept a worse average price.
  2. **Rest an order:** leave the remaining 40 as a resting limit at 50¢ and wait. Risk: if the market moves further away, we stay unhedged.
  3. **Cancel and accept residual exposure:** log the 40-share short as unhedged delta, factor it into the market's cap.
- **MVP choice:** walk the book up to a configurable slippage limit (e.g., 2¢), then stop and accept residual exposure.

### Case D — Polymarket hedge order fails entirely

- API returns an error (rate limit, network blip, insufficient USDC on Polygon, Polymarket maintenance).
- **Alice's Solana trade has already committed.** We can't un-commit it.
- The bot must:
  1. Retry with exponential backoff (3 attempts over ~10 seconds).
  2. If still failing, mark this fill as **unhedged** in the database and **alert oncall**.
  3. Add the unhedged delta to the market's exposure counter.
  4. **Halt new quotes on this market** until the unhedged position is cleaned up.
- **We are now directionally exposed to BTC.** If Alice was right, we lose. If she was wrong, we win. This is the business risk of the bootstrap strategy.

### Case E — Unhedged delta exceeds the cap

- A burst of users buys 600 YES in 30 seconds. Hedging bot is mid-flight hedging an earlier order.
- Unhedged exposure temporarily hits $520, over our $500 cap.
- The mirror service's signed-quote endpoint checks the cap **before** signing. New quote requests return `OUT_OF_CAPACITY`.
- Frontend shows: _"Market temporarily unavailable. Please try again in a moment."_
- Once the bot catches up and exposure drops below the cap, quoting resumes.

### Case F — Alice wants to sell her 100 YES before resolution

- Alice later wants to exit her position at the current market price.
- Frontend requests a sell quote: our backend reads Polymarket's best YES bid (say 55¢), subtracts our 1¢ spread → quote Alice **54¢**.
- Alice signs a Solana `place_order` tx with `side: SELL`.
- Solana program:
  - Burns 100 YES shares from Alice's `UserPosition`.
  - Transfers **$54 USDC** from the market vault to Alice.
- Hedging bot sees the event and **sells 100 YES on Polymarket at 55¢**, receiving $55.
- Net for this round-trip exit: +$1 spread again.
- **Catch:** the market vault must have enough USDC to pay Alice. Since we collected $51 from her earlier, and she's now withdrawing $54, the extra $3 has to come from somewhere. Options:
  - Cross-market treasury pool (one big USDC PDA shared across all markets).
  - Top up the market vault from treasury as part of the sell instruction.
- **MVP:** single cross-market treasury PDA; per-market vaults are just an accounting abstraction.

### Case G — Market resolves while a user still has unclaimed shares

- Not really an unhappy path — users just claim whenever. The market vault + treasury must retain enough USDC until all shares are claimed.
- **Important:** we should not sweep the vault to treasury immediately on resolve; drain it only after a grace period (say 90 days) and keep a reserve for late claimants.

### Case H — Polymarket resolves differently than expected (dispute)

- UMA disputes can flip a market's initial resolution.
- If we already pushed `outcome: YES` to Solana and started paying out, and then Polymarket flips it to NO, we have a problem.
- **Mitigation:** the oracle signer waits for Polymarket's **finalized** outcome (past the UMA dispute window, typically ~48 hours) before calling `resolve_market` on Solana.
- Frontend shows "Pending final resolution" during the dispute window.

### Case I — Our Polygon wallet runs out of USDC

- We've hedged a lot of buys and haven't bridged more USDC over.
- Hedging bot gets insufficient-funds errors on Polymarket.
- **Mitigations:**
  - Automatic low-balance alert.
  - Pause new quotes on the affected side when Polygon USDC < threshold.
  - Trigger a bridge top-up (manual at MVP, automated later).

### Case J — Our Solana treasury runs out of USDC

- Symmetric problem: lots of winning claims drain the Solana vault.
- After each Polymarket redemption, the hedging bot should **bridge the redeemed USDC back to Solana** to refill the treasury.
- If bridging is slow, we need a working capital buffer on Solana (already accounted for in our initial $5k).

### Case K — User sends a stale quote (replay attack)

- Malicious user captures an old signed quote and resubmits it later.
- **Mitigation:** each signed quote includes a unique `nonce` stored in a `UsedNonces` PDA or user-specific account; the program rejects duplicates.

### Case L — Our quote-signing key is compromised

- Attacker can mint arbitrary advantageous quotes.
- **Mitigations:**
  - Store the key in a KMS / HSM.
  - Rotate via a `Config` account update (admin multisig).
  - Per-quote sanity checks on-chain: price must be within X% of the last on-chain recorded price (if we publish one).

---

## Summary of what this tells us we must build (revisited)

Looking at the unhappy paths, the MVP can't skip any of these:

1. **Signed-quote endpoint with expiry + nonce**
2. **Solana `place_order` instruction that verifies the quote signature, expiry, and nonce**
3. **Cross-market treasury PDA** (not per-market vaults)
4. **Hedging bot with retries, slippage limits, and partial-fill handling**
5. **Unhedged-delta tracker that gates new quotes**
6. **Oracle signer that waits for Polymarket finalization before resolving on Solana**
7. **Balance monitors** on both Solana treasury and Polygon hedge wallet
8. **Alerts + kill switch** for oncall

Everything else (fancy UI, more market types, decentralised resolution) is Phase 2+.
