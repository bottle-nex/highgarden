# Prediction Market on Solana — Hackathon Brainstorm

## The Crux (in one line)

Build a **Polymarket-style prediction market on Solana**, but solve the _cold-start liquidity problem_ by **mirroring Polymarket's order book** onto our platform and **hedging trades back to Polymarket** (with a spread for profit + risk buffer).

---

## Background: Why this problem exists

- **Polymarket** is the dominant prediction market, but it lives on **Polygon**. Its contracts are _mildly centralised, mildly decentralised_ — a hybrid design.
- Solana does **not** have a serious prediction market yet. There's a clear gap.
- Building the smart contracts / matching engine is **not the hard part** — "it's easy to build."
- The **hard part is liquidity**. A prediction market with no traders = no market.
  - **Trepa** (Solana prediction market) tried this and failed — _market makers never showed up_.
  - You can't just "call" market makers and ask them to provide liquidity on a new venue.
- So the classical chicken-and-egg problem: no liquidity → no users → no liquidity.

---

## The Core Idea: Bootstrap liquidity from Polymarket

Instead of _waiting_ for market makers, **become the market maker ourselves** by proxying Polymarket's liquidity onto Solana.

### How it works conceptually

1. **Mirror Polymarket's order book** onto our Solana UI.
   - Users on Solana see the same markets, same prices, same depth as Polymarket.
   - From the user's perspective, the market already looks liquid on day one.

2. **When a user places an order on Solana, we offset it on Polymarket.**
   - User buys "YES" at 51¢ on our Solana platform.
   - We (the platform operator) immediately go buy the same "YES" on Polymarket at 50¢.
   - We pocket the 1¢ spread as profit.
   - Net exposure ≈ 0, because every trade is hedged on the other side.

3. **The spread serves two purposes:**
   - **Profit margin** for the operator.
   - **Risk buffer** — if the Polymarket price moves between the time the user submits and the time we hedge, the spread absorbs small adverse moves.

---

## The Hard Part: Cross-chain execution risk

This is **not** atomic. Solana and Polygon are separate chains — **no composability**.

- A trade executes on Solana → we then have to _separately_ execute the hedge on Polygon.
- Between those two steps:
  - The Polymarket price can move.
  - Our Polymarket order can partially fill or not fill at all.
  - If we committed to the Solana user but can't complete the hedge → **we eat the delta** (loss).
- This residual exposure is the real risk of the business.

**Mitigations:**

- **Quote with a spread** (51¢ on Solana when Polymarket shows 50¢) so small adverse moves don't put us underwater.
- Accept that there's a small, bounded operator risk — that's the cost of bootstrapping liquidity.

---

## Precedent: This pattern already works elsewhere

- **Tensor** and similar platforms did the exact same thing in a different domain — they fronted another venue's liquidity with their own UI/UX, then gradually built up their own native liquidity and order flow over time.
- Strategy: **start as a liquidity proxy, eventually become a real independent market.**

---

## What we're actually building (scope)

### MVP for the hackathon

1. **Solana-side program / order book UI** for prediction markets.
   - A Polymarket-like interface (markets, YES/NO, order book, positions).
2. **Liquidity mirror** — backend service that pulls Polymarket's live order book and displays it on our Solana front-end, with a configurable spread added on top.
3. **Trade execution flow on Solana** — users can place orders against the mirrored book.
4. **Hedging bot (off-chain)** — when a Solana trade fills, the bot places the offsetting trade on Polymarket (on Polygon).
5. **Risk / delta tracking** — monitor net exposure, unhedged inventory, PnL.

### Out of scope (for now)

- Atomic cross-chain execution (not feasible; we accept the latency risk).
- Fully on-chain matching with native market makers (that's the long-term goal).
- Talking to / onboarding external market makers.

---

## The long-term vision

- **Phase 1 (hackathon):** Proxy Polymarket liquidity → users on Solana get a working prediction market on day one.
- **Phase 2:** As real order flow grows on Solana, our own order book starts to carry its own weight. The Polymarket hedge becomes a fallback rather than the primary source.
- **Phase 3:** Fully native Solana prediction market with independent liquidity — Polymarket is no longer required.

---

## What Polymarket gives us (confirmed from their docs & official SDKs)

Polymarket runs a **public CLOB (Central Limit Order Book)** with first-class programmatic access. Programmatic trading is clearly a supported use case — they ship official SDKs for it.

### Endpoints

- **REST base URL:** `https://clob.polymarket.com`
- **WebSocket:** `wss://clob.polymarket.com`
- **Gamma Markets API** (market/event metadata, token IDs, `tickSize`, `negRisk` flag): `https://docs.polymarket.com/developers/gamma-markets-api/get-markets`
- **Chain:** Polygon (chain ID `137`). Settlement currency: **USDC on Polygon**.

### Authentication

- You need a **Polygon wallet** (private key or Magic/email login).
- Call `createOrDeriveApiKey()` → returns an **API key + secret + passphrase** tied to that wallet. Used for authed REST + the `user` WebSocket channel.
- Two signature types: `0` = browser wallet (Metamask etc.), `1` = Magic/email login.
- Authed calls also need a **funder address** = your Polymarket Profile Address (where your USDC lives).

### Official SDKs (we can use these directly, no need to reimplement)

- **TypeScript:** `@polymarket/clob-client` — official.
- **Rust:** `polymarket/rs-clob-client` — official.
- **Python (third-party but solid):** `qualiaenjoyer/polymarket-apis`.
- **Go/TS unified kit (third-party):** `huakunshen/polymarket-kit`.

### What the SDK lets us do

- `getOrderBook(tokenID)` — full snapshot of bids/asks for any market.
- `createAndPostOrder({ tokenID, price, side, size }, { tickSize, negRisk }, OrderType.GTC)` — place an order.
- Cancel orders, query positions, query fills.
- **WebSocket channels:**
  - `market` channel (public, no auth) — streams `book`, `price_change`, `tick_size_change`, `last_trade_price` for any `assetId`.
  - `user` channel (authed) — streams your own order/fill updates.

### What we still need to confirm manually

- **Exact rate limits** — not in SDK README; check Polymarket Discord `#developers` or hit the API and observe `429`s.
- **ToS language** on automated trading / geographic restrictions — Polymarket blocks US users; depending on where _you_ operate from, this matters.
- **Market maker rebate program** — Polymarket has historically offered rebates to MMs. Worth asking in Discord whether we'd qualify.

---

## What we need from Polymarket vs. what we build ourselves

### From Polymarket (reuse, don't rebuild)

| Thing                           | How we get it                                                     |
| ------------------------------- | ----------------------------------------------------------------- |
| List of live markets + metadata | Gamma Markets API                                                 |
| Live order book per market      | `clobClient.getOrderBook(tokenID)` + WS `market` channel          |
| Live prices / trades            | WS `book`, `price_change`, `last_trade_price` events              |
| Place hedge orders              | `clobClient.createAndPostOrder(...)`                              |
| Cancel hedge orders             | `clobClient.cancelOrder(...)`                                     |
| Track our hedge fills           | WS `user` channel (authed)                                        |
| Settlement of resolved markets  | Polymarket resolves on Polygon; we read the outcome and mirror it |

### We build ourselves

**1. Solana on-chain program (Anchor)**

- Market account (references the Polymarket market by ID + resolution source).
- User positions (YES / NO balances).
- Order placement + fill logic (or a simpler "instant-fill against a quoted price" model for MVP).
- USDC vault (Solana USDC) for collateral.
- Resolution / payout instruction — triggered when the underlying Polymarket market resolves.

**2. Liquidity mirror service (off-chain backend)**

- Subscribes to Polymarket WS `market` channel for every market we list.
- Applies our spread (e.g. Polymarket ask 50¢ → we quote 51¢).
- Publishes quotes to our Solana front-end (and optionally on-chain as signed price oracles).

**3. Hedging bot (off-chain backend)**

- Listens for fills on our Solana program.
- For each Solana fill, immediately places the offsetting order on Polymarket via `clobClient`.
- Tracks unhedged inventory / delta per market.
- Kill switch: if net exposure > threshold, pause new Solana quotes.

**4. Treasury bridge**

- We need **USDC on both chains**: Solana USDC (to pay out Solana users) and Polygon USDC (to fund our Polymarket hedge account).
- Rebalancing between the two — manual at first, automated later via a bridge like Wormhole / deBridge / Mayan.

**5. Frontend (Next.js)**

- Market list, order book view, trade panel, positions, Solana wallet connect.
- Polymarket-quality UX is the _reason users come to us instead of bridging_, so this matters.

**6. Resolution oracle**

- When a Polymarket market resolves, someone has to tell our Solana program the outcome. Either:
  - Trusted signer (us) — simplest, MVP-appropriate.
  - An attestation service (Wormhole, Pyth, Switchboard) — more decentralised.

---

## Revised open questions

- **ToS / geography:** Polymarket blocks US users. Confirm whether running a hedging bot against them from your jurisdiction is permitted.
- **Hedging latency:** What's the realistic end-to-end latency (Solana fill → Polygon hedge)? This determines how wide the spread has to be.
- **Spread calibration:** How wide is wide enough to cover latency risk + adverse selection + profit, but not so wide that users prefer going to Polymarket directly?
- **Inventory limits:** How much unhedged delta are we willing to carry before pausing trading?
- **Market coverage:** Mirror _all_ Polymarket markets, or only the top-N most liquid ones (where our hedge is most reliable)?
- **User acquisition:** Why would a Solana user trade here instead of just bridging to Polygon? (Better UX? Solana-native wallet? Lower fees? Speed?)
- **Settlement:** When a market resolves on Polymarket, how do we propagate the resolution to our Solana side?

---

## TL;DR

Build a prediction market on Solana that **looks liquid from day one** by mirroring Polymarket's order book and hedging every user trade back to Polymarket at a small spread. Accept bounded cross-chain execution risk as the cost of bootstrapping. Once organic volume arrives, wean off the Polymarket hedge and become a standalone Solana-native prediction market.
