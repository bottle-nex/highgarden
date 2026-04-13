# SolMarket — What's Centralised, What's Decentralised, and Why

> Companion to [brainstorming.md](brainstorming.md), [use-case.md](use-case.md), and [steps.md](steps.md).
> This doc is the **architectural rationale**: for every moving piece, does it live on-chain (decentralised, trust-minimised, verifiable) or off-chain (centralised, operator-controlled, fast and cheap)? And **why** that side of the fence?

---

## The guiding principle

We only decentralise things where decentralisation **actually buys us something**:

1. **Custody of user funds** — nobody should have to trust us with their USDC.
2. **Proof that a trade happened at the price the user agreed to** — the user's position must be enforceable without our cooperation.
3. **Payouts** — once a market resolves, claiming should not depend on us being online or honest.

Everything else — the parts where decentralisation would cost us latency, liquidity, or plain feasibility — stays centralised. The mental model is: **the chain is the vault and the judge; the server is the market maker and the router**.

This is not a compromise we're embarrassed about; it's the same hybrid shape Polymarket itself uses. Pure decentralisation of a CLOB + cross-chain hedger is either impossible (no atomic composability between Solana and Polygon) or too slow to be useful.

---

## The components, sorted

### DECENTRALISED (on-chain, Solana program)

#### 1. Custody of user USDC — the treasury vault PDA

**Why on-chain:** If we held user deposits in a backend-controlled wallet, we'd be a custodian, and the whole point of a Solana-native product evaporates. A PDA-owned USDC token account can only be moved by the program's instructions — not by us, not by a leaked server key, not by a rogue employee. Users can verify the vault address, see inflows and outflows on any explorer, and know exactly what collateral backs their claims.

**Tradeoff accepted:** We lose the ability to "just fix it" off-chain. Every movement of user money requires an on-chain instruction with a valid signer. Good.

#### 2. User positions (YES / NO shares)

**Why on-chain:** A position is a **claim on future USDC**. If it lived in our database, we could unilaterally delete it, modify it, or lose it in a bad migration. As a PDA keyed by `(user, market)`, the position is the user's to prove — they can show their Phantom wallet controls shares even if our backend disappears.

**Tradeoff accepted:** Slightly more rent, and every position update costs a transaction. Fine — it's the product.

#### 3. Order execution (the `place_order` instruction)

**Why on-chain:** This is where the user's USDC actually moves and their shares are minted. It has to be atomic with the collateral transfer, and it has to be enforceable by the user without our participation. If a user signs a `place_order` tx containing a valid signed quote, the program must fill it — we cannot "change our mind" between quote and fill.

**Tradeoff accepted:** We give up the ability to cancel a trade once the user has submitted. That's why the signed quote has a tight expiry and a nonce — the controls live in the quote, not in our ability to pull out.

#### 4. Quote signature verification + nonce replay protection

**Why on-chain:** Centralising signature verification would mean "trust the server to only honor valid quotes," which defeats the purpose of a signed quote. The whole point of signing the quote is that **the chain**, not the server, enforces the price. The `UsedNonce` PDA is the same logic: whichever node processes the tx first wins, and the second attempt fails deterministically. No distributed-state bugs, no race conditions between our backend and the chain.

**Tradeoff accepted:** We can't revoke a still-valid, unexpired quote once it's out. The 5-second expiry keeps the blast radius small.

#### 5. Market resolution enforcement + claim payouts

**Why on-chain:** Once a market is `Resolved { winning_side }`, any holder of winning shares must be able to redeem them for USDC **whether or not our backend is running**. If claims required our server to co-sign, we'd be a chokepoint for user funds, and any outage or shutdown would freeze people's winnings. The `claim` instruction is pure on-chain logic: "do you hold winning shares? here is your USDC from the vault."

**Tradeoff accepted:** We can't recall a bad resolution after it's been posted. Mitigated by the 48h dispute-window wait before the oracle signer posts anything.

#### 6. Admin pause / kill switch (per-market and global)

**Why on-chain:** Pausing has to be enforceable — a backend that "forgets" to stop quoting during a pause is worthless. The program checks `market.status` inside `place_order`, so a paused market cannot accept new orders regardless of what the backend does. Pausing is restricted to the admin key stored in the on-chain `Config`.

**Tradeoff accepted:** The admin key is a trust assumption — but it's a bounded one (it can only pause, not move funds).

---

### CENTRALISED (off-chain, our backend)

#### 7. Liquidity mirror — reading Polymarket's order book

**Why off-chain:** Polymarket lives on Polygon with its own CLOB and WebSocket feed. There is **no trust-minimised, low-latency way** to pipe a live Polygon order book into a Solana program. We'd need a cross-chain oracle streaming book updates at sub-second cadence, which doesn't exist, would cost more than any reasonable spread, and would still be slower than just running a WebSocket client. So the mirror is a plain Bun service holding the top-of-book in memory, updating on every `book` and `price_change` event.

**Tradeoff accepted:** Users have to trust that the price we show them reflects Polymarket. Mitigated because (a) they can open Polymarket themselves and compare, and (b) our spread is bounded and visible.

#### 8. Quote pricing + signing

**Why off-chain:** Pricing a quote needs current Polymarket depth (off-chain data) plus current unhedged-delta state (off-chain state). Neither of those can live on Solana cheaply. The signing key is held by the backend and rotated via an on-chain `Config` update — a compromise between custodial trust (we pick the price) and verifiable enforcement (the chain validates the signature and rejects expired or replayed quotes).

**Tradeoff accepted:** We can in principle issue a dishonest quote (wider than advertised, or refusing to quote). But we can't overspend the treasury, and users can always compare against Polymarket's public feed before signing.

#### 9. Hedging bot — placing offsetting orders on Polymarket

**Why off-chain:** Polymarket is on another chain. There is no instruction on Solana that can "also" place a Polymarket order — that's the whole cross-chain non-atomicity point from [brainstorming.md](brainstorming.md). The hedger is an off-chain service that subscribes to Solana logs, decodes `OrderFilled` events, and fires orders at `clob.polymarket.com` via the official TypeScript SDK. This is the leg where execution risk lives, and where the spread justifies itself.

**Tradeoff accepted:** If the hedger fails, we eat the delta. Mitigations: retries, partial-fill book-walking, the unhedged-delta cap, and the kill switch.

#### 10. Unhedged-delta tracker + pre-quote capacity check

**Why off-chain:** The tracker has to read Polymarket fill confirmations (off-chain) and Solana fill events (off-chain subscription to on-chain events) and merge them into a single view of "how exposed are we?" — a stateful computation that doesn't belong in a program. Gating new quotes at signing time is the correct chokepoint: the on-chain program can't know about our inventory limits.

**Tradeoff accepted:** If the tracker is buggy we could over-quote. Mitigated by aggressive logging, the global kill switch, and a treasury separate from the exposure calculation.

#### 11. Resolution oracle signer

**Why off-chain for MVP, decentralisable later:** To resolve a market on Solana we have to know the Polymarket outcome, which means watching UMA on Polygon. The MVP uses a trusted signer (a keypair we control) that calls `resolve_market` only after the 48h UMA dispute window closes. Long term this should move to Wormhole / Pyth / Switchboard attestations so users don't have to trust us to post outcomes honestly — but that's Phase 2 in [steps.md](steps.md).

**Tradeoff accepted:** Users trust that we report Polymarket's outcome faithfully. Mitigated by the 48h wait (so we can't jump the gun) and the fact that a dishonest resolution is publicly verifiable against Polymarket.

#### 12. Treasury rebalancing between Solana USDC and Polygon USDC

**Why off-chain:** Bridging USDC across chains is a human / script-driven operation at MVP scope. There's no clean on-chain way to say "when Polygon USDC < $500, move $1000 from Solana via Wormhole" without introducing a whole cross-chain automation stack. An operator runs `scripts/bridge-usdc.ts` when the balance monitor alerts.

**Tradeoff accepted:** Operational toil during the hackathon. Phase 2 can automate it.

#### 13. Frontend (Next.js), market metadata display, portfolio views

**Why off-chain:** Obviously — it's a web UI. Worth stating explicitly only because the UI is *not* the source of truth for anything. Positions are read from on-chain PDAs, quotes come from the backend, market status comes from the chain. The frontend is a view layer; if it crashes, nothing about the user's funds or positions changes.

**Tradeoff accepted:** None — this is where centralisation is free.

---

## The dividing line, stated plainly

| Concern                                     | On-chain (Solana)                | Off-chain (our backend)      |
| ------------------------------------------- | -------------------------------- | ---------------------------- |
| User USDC custody                           | ✅ treasury vault PDA            |                              |
| User positions (shares)                     | ✅ `UserPosition` PDA            |                              |
| Trade execution atomicity                   | ✅ `place_order`                 |                              |
| Quote validity (signature, expiry, nonce)   | ✅ program verifies              | Signed by backend            |
| Market pause / kill switch enforcement      | ✅ `market.status` gate          | Triggered by admin endpoint  |
| Resolution enforcement + claim payouts      | ✅ `resolve_market` + `claim`    |                              |
| Reading Polymarket order book               |                                  | ✅ mirror service            |
| Quote pricing (with spread + capacity)      |                                  | ✅ signed-quote endpoint     |
| Hedging trades on Polymarket                |                                  | ✅ hedging bot               |
| Unhedged-delta tracking                     |                                  | ✅ exposure tracker          |
| Oracle: reporting Polymarket outcome        |                                  | ✅ oracle signer (Phase 2: attestation service) |
| Treasury rebalancing across chains          |                                  | ✅ manual script             |
| UI, market list, portfolio                  |                                  | ✅ Next.js                   |

The short version: **the chain holds the money and the rules; the server holds the prices and the plumbing**.

---

## Example: tracing one trade through the dividing line

> "Alice buys 100 YES on the BTC > $150k market at 51¢."

1. **Centralised.** The mirror service is already subscribed to Polymarket's WebSocket and has the current top of book in memory: YES ask 50¢.
2. **Centralised.** Alice's frontend calls `POST /quote`. The backend reads the mirror cache (50¢), applies a 1¢ spread, checks the unhedged-delta tracker (under $500 cap → OK), generates a nonce, signs `{marketId, BUY, YES, 51¢, 100, expiresAt: now+5s, nonce}` with the ed25519 quote key. Returned to the frontend.
3. **Decentralised.** Alice signs a Solana tx calling `place_order(signed_quote)`. The program verifies the quote signature against the `Config.quote_signer_pubkey`, checks the expiry against the Solana clock, creates the `UsedNonce` PDA (fails if already used), transfers 51 USDC from Alice's token account to the treasury vault PDA, and mints 100 YES shares to her `UserPosition` PDA. Emits `OrderFilled`. **At this point Alice's position exists on-chain, enforceable by her alone.**
4. **Centralised.** The hedging bot is subscribed to Solana program logs, decodes `OrderFilled`, and fires `clobClient.createAndPostOrder(YES, 50¢, BUY, 100)` on Polymarket. The bot increments the `Exposure` row to $100, and decrements when the Polymarket fill confirms.
5. **Both.** Eventually the market resolves. The **centralised** oracle signer watches UMA on Polygon, waits 48h past finalisation, then calls the **decentralised** `resolve_market(YES)` instruction. Our Polymarket YES tokens redeem for $100 on Polygon (centralised — the bot calls `redeem`). Alice — whenever she wants, even if our backend is dead — calls the **decentralised** `claim` instruction and the program transfers $100 from the treasury vault PDA to her wallet and burns her shares.

At every step, the **rule being enforced** determines the side of the line:
- Quote pricing? Centralised — needs live off-chain data.
- "This quote is really ours, hasn't been replayed, and hasn't expired"? Decentralised — the chain enforces it.
- Hedging on Polymarket? Centralised — different chain, no other option.
- "Alice gets her $100 if she had 100 winning shares"? Decentralised — the user's money should never depend on our availability.

That is the whole design: **put the money and the enforceable rules on Solana; keep the pricing, routing, and cross-chain plumbing on the server; and let the signed-quote + nonce + expiry pattern be the tightrope between them.**
