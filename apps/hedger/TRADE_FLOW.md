# What Happens When You Place a Trade — Explained Simply

This document follows **one trade, from start to finish**, and shows what every part of our system does along the way.

We'll use one example throughout, so you can see exactly what's happening:

> **Alice opens our app and bets $5.10 that it will rain tomorrow.**
> She buys **10 YES shares at 51¢ each** on the "Will it rain tomorrow?" market.

Keep Alice in mind. Every section below shows what happens to _her_ trade.

---

## The Big Picture (1-Minute Version)

Think of our protocol like a **bookie**. Alice walks up and says "I'll bet $5.10 that it'll rain." We take her money and give her a ticket worth $10 if she's right, $0 if she's wrong.

But we don't want to gamble. We want to make a small fee no matter what.

So the moment Alice gives us $5.10, we secretly turn around and place the **exact same bet on a bigger bookie** (Polymarket) for about $5.10. Now:

- If it rains: the bigger bookie pays us $10, we pay Alice $10. We net $0 from the outcome but we kept the small fee we charged her up front.
- If it doesn't rain: Alice's ticket is worth $0, our ticket on the bigger bookie is worth $0. Same result — we kept the fee, we're not down anything.

This "secretly placing the matching bet" is called **hedging**. The thing that does it is called **the hedger**. That's what this document is about.

---

## The Cast of Characters

Six pieces of software touch Alice's trade:

| Piece              | What it does                                                           | Lives in                         |
| ------------------ | ---------------------------------------------------------------------- | -------------------------------- |
| **Web app**        | The website Alice clicks buttons on                                    | [apps/web/](../web/)             |
| **Server**         | Our backend. Stores users, signs prices, sends Alice's trade to Solana | [apps/server/](../server/)       |
| **Solana program** | The smart contract. Holds USDC, tracks who owns what                   | [apps/contract/](../contract/)   |
| **Hedger**         | Watches Solana, mirrors Alice's trade on Polymarket                    | [apps/hedger/](.) ← **this app** |
| **Polymarket**     | Outside prediction market we hedge against                             | external                         |
| **Polygon chain**  | Where Polymarket pays out. We collect winnings here                    | external                         |

---

## Step 1 — Alice Asks "What's the Price?"

Alice picks "Will it rain tomorrow?" on the website and clicks **Buy YES, 10 shares**.

The web app pings our server: _"Hey, what does it cost to buy 10 YES shares right now?"_

Our server, in [QuoteController](../server/controllers/markets/controller.quote.ts), does this:

1. **Looks up the market** in our database. Confirms it's a real market we've already deployed on Solana.
2. **Checks our risk dashboard.** Are we already holding too much unhedged risk on this market? Is the market paused for some reason? If yes → reject and Alice sees an error.
3. **Reads the live price from Polymarket.** Polymarket says YES is currently being sold at 50¢. We add a 1¢ markup (our fee) and quote Alice **51¢ per share**.
4. **Cryptographically signs the price.** Our backend has a special key (the "quote signer key"). It signs a small note that says:

   > _"I, the SolMarket backend, promise: Alice can buy 10 YES shares for 51¢ each on this market. Valid for the next 5 seconds. Random ticket number: `8f3a...c4`."_

   This signature is the trick that makes everything else safe. We'll see why in step 3.

5. **Sends the signed note back to the web app.**

Alice's screen now shows: _"10 YES @ 51¢ = $5.10. [Confirm]"_. The signed note sits in her browser.

---

## Step 2 — Alice Hits "Confirm"

The web app sends the signed note back to our server. The server's job now is to actually move money.

A wrinkle: Alice doesn't have a crypto wallet. We hold her keys for her (a "**custodial wallet**"). So the server does this in [SolanaTradeService.place_order()](../server/services/service.solana-trade.ts):

1. **Loads Alice's encrypted Solana key** from our database and decrypts it.
2. **Builds a Solana transaction** with two instructions:
   - **Instruction A:** "Hey Solana, please verify this signature is real" — using Solana's built-in signature checker.
   - **Instruction B:** "Hey our smart contract, execute this trade" — pointing to instruction A as proof.
3. **Signs and sends the transaction** to the Solana blockchain using Alice's key.

Why two instructions? So the smart contract can be 100% sure the price came from us. If Alice tried to forge the price (say, claim YES costs 1¢), instruction A would fail because she can't fake our signature.

---

## Step 3 — Solana Smart Contract Runs

The transaction lands on Solana. Our smart contract (the [`place_order` instruction](../contract/contract.md)) runs through this checklist:

```
✓ Was the price signed by SolMarket's official signer?
✓ Has this signed note expired? (5-second window)
✓ Is the market open and not paused?
✓ Has this random ticket number been used before? ← prevents double-spending
✓ Is Alice trying to BUY (not SELL)?
✓ Is the price between 1¢ and 99¢?
```

All checks pass. Now it does the actual work:

1. **Marks the ticket number as "used"** so it can never be replayed.
2. **Pulls $5.10 of USDC out of Alice's wallet** and puts it in the protocol's vault. (51¢ × 10 shares = $5.10.)
3. **Records that Alice now owns 10 YES shares** of this market.
4. **Shouts to the world** by emitting an event — basically writing into the transaction's logs:

   > 📣 **OrderFilled!** User: Alice's pubkey, Market: "rain tomorrow", Side: BUY, Outcome: YES, Size: 10, Price: 51¢, Nonce: `8f3a...c4`

Alice's part is done. She has her 10 YES shares. She can close her browser.

But the hedger is **listening for that shout**.

---

## Step 4 — The Hedger Hears the Shout

The hedger is a long-running program. It's been awake the whole time, watching Solana for `OrderFilled` events.

It actually listens **two ways**, like having both an alarm clock and a backup alarm clock:

### The fast way: live listener

[solana/listener.ts](solana/listener.ts) keeps a permanent **websocket** open to Solana — like a phone line that's always off-hook. The instant Alice's transaction is confirmed, Solana pushes the logs over that line. Within milliseconds, the hedger sees the `OrderFilled` event.

### The backup way: catch-up poller

What if the websocket disconnects for 30 seconds? What if the hedger was restarting when Alice's trade landed? We'd miss it.

So [solana/poller.ts](solana/poller.ts) **runs every 10 seconds** and asks Solana, "give me every transaction since the last one I saw." It catches anything the websocket missed.

A small **bookmark** in our database (called a "cursor") remembers the last transaction we processed, so the poller knows where to resume.

### Both paths converge

When either path sees Alice's event, it puts a "**job**" into a Redis queue (a fast in-memory database used as a to-do list).

**Each job's ID is the random ticket number** (the nonce, `8f3a...c4`). And our queue refuses to accept two jobs with the same ID. So:

- Live listener fires first → job created.
- Poller fires 10 seconds later for the same trade → "already exists, ignored."

This is how we guarantee Alice's trade gets hedged **exactly once**, even though we have two redundant paths watching for it.

---

## Step 5 — The Hedger Picks Up the Job

A worker process inside the hedger pulls Alice's job off the queue. This calls [HedgeProcessor.handle()](hedger/processor.ts), which is the heart of the hedger.

### 5a. Look up details

The job only contains the raw event data (pubkeys, numbers). The processor enriches it:

- "Whose pubkey is this?" → finds Alice in our database.
- "Which market is this?" → finds the rain market and its **Polymarket token IDs** (Polymarket's internal IDs for the YES and NO sides of the same question).
- Creates a "Fill" record (Alice's trade) and a "Hedge" record (our matching trade) in the database, both starting in `PENDING` status.

### 5b. Decide what to buy

The mapping is dead simple:

> Alice bought **YES** on Solana → we buy **YES** on Polymarket.
> If Alice had bought NO, we'd buy NO. If she'd sold YES, we'd sell YES.

Whatever she did, we do the same thing. Now we both win or both lose at the same time, and we're protected.

### 5c. Mark "in progress"

- Hedge status: `PENDING` → `HEDGING`.
- "Unhedged risk" gauge for this market: bumped up by $5.10. (We took Alice's money but haven't placed the matching bet yet — that $5.10 is at risk for a few seconds.)

### 5d. Place the order on Polymarket

The hedger asks Polymarket: _"What's your best YES price right now?"_ Polymarket says: _"50¢, with 10 shares available."_

The hedger sends Polymarket a **fill-or-cancel order** — meaning _"buy me 10 YES at 50¢ right now, or don't bother, but don't leave the order sitting there."_

We need an instant fill. We can't have an order resting on the book that might fill in two hours.

### 5e. Three things can happen

**Case 1 — Fully filled (the happy path).**
Polymarket says: _"Done. You bought 10 YES at 50¢. Total: $5.00."_

The hedger:

- Marks the hedge `FILLED` in the database.
- Drops the unhedged-risk gauge by $5.10 (it's hedged now).
- Done. Alice's trade is fully covered.

We made: **51¢ × 10 = $5.10 from Alice, paid 50¢ × 10 = $5.00 on Polymarket. We pocketed 10¢ in fees. We have no risk.**

**Case 2 — Partial fill ("walk the book").**
Polymarket says: _"I only had 6 shares at 50¢. Done with those — you got 6 shares. The next 4 are at 51¢."_

The hedger now [walks the book](hedger/walk-book.ts): it bumps its price up 1¢ (to 51¢) and tries again for the remaining 4 shares. If still partial, it bumps to 52¢, and so on.

There's a hard ceiling: by default we won't pay more than **2¢ above** our original target before giving up. If we hit the ceiling, the hedge is marked `PARTIAL`, with whatever we did manage to fill recorded.

**Case 3 — Polymarket throws an error.**
Network blip? Polymarket having a bad day? The hedger looks at the error:

- _"Invalid signature"_ / _"forbidden"_ / _"blocked"_ → permanent problem, give up.
- Anything else → temporary, retry.

Our queue retries up to 5 times with exponential backoff (1s, 2s, 4s, ...). If all 5 fail, things get serious — see step 6.

---

## Step 6 — When Hedging Permanently Fails (Auto-Pause)

Imagine all 5 retries fail. We took Alice's $5.10 and **never managed to place the matching bet**. We're now actually exposed: if YES wins, we owe Alice $10 and we don't have a hedge to cover it.

What we do **not** want: more users keep buying on this market while we're broken.

So the hedger automatically pulls the emergency brake (in [index.ts:147](index.ts)):

1. **Marks the hedge `FAILED`** in the database with the error message.
2. **Pauses the market on Solana.** The hedger has its own "admin" key. It sends a transaction telling our smart contract: _"freeze this market — refuse all new trades."_ Until ops manually unpauses it, every new `place_order` for this market will fail.
3. **Records an alert** so the on-call engineer can investigate.

Alice's specific trade is still stuck failing, but **no new Alices can pile in** while we figure it out.

---

## Step 7 — What If the Hedger Crashes Mid-Trade?

Say the server restarts right while Alice's hedge is being placed on Polymarket. The hedge row is stuck in `HEDGING` status forever. Bad.

So **on every startup**, before doing anything else, the hedger runs **boot recovery** ([hedger/recovery.ts](hedger/recovery.ts)):

1. **Find every hedge stuck in `HEDGING`** and reset it to `PENDING`. The job is still in the queue (Redis is persistent), so the worker will pick it up again.
2. **Recompute the unhedged-risk gauge** from scratch by adding up all unhedged fills. If the live number drifted by more than $1 from what's in the database, overwrite the database with the correct number.

This is why a hedger crash isn't a disaster — the next boot self-heals.

---

## Step 8 — Time Passes... The Market Resolves

A day later, it rains. The "rain tomorrow" market needs to be settled.

This is handled by a separate loop, the **resolver** ([resolver/poll.ts](resolver/poll.ts)), that runs every 60 seconds. It walks every market through three stages:

```
   PENDING ──► POLYMARKET_RESOLVED ──► SOLANA_RESOLVED ──► REDEEMED
   "still     "Polymarket says         "we told our      "we collected
    open"      YES won"                 contract too"      our money"
```

### Stage 8a — Notice that Polymarket called a winner

Resolver pings Polymarket: _"Has this market resolved?"_ Polymarket answers: _"Yes, YES won."_

But we're paranoid. Polymarket sometimes has disputes (their oracle, UMA, has a 48-hour window where someone can challenge the result). So the resolver only marks our database `POLYMARKET_RESOLVED` — it doesn't tell our smart contract yet. It waits.

### Stage 8b — After 48 hours, tell Solana

Once 48 hours have passed since Polymarket called it, the resolver sends a transaction to our smart contract using its "**oracle**" key, saying: _"Mark this market resolved with YES as the winner."_

The smart contract flips the market to `Resolved` and stores the outcome. Now **Alice can claim her winnings**.

### Stage 8c — Collect from Polymarket

Our hedge on Polymarket is now a winning ticket too. The resolver calls a function on the Polygon blockchain ([polymarket/redeem.ts](polymarket/redeem.ts)) that says _"redeem my winning tokens for cash."_ Polymarket sends $10 of USDC back to our wallet on Polygon.

State machine done: `REDEEMED`.

---

## Step 9 — The Reconciler (Paranoia Loop)

Running alongside the resolver, every 60 seconds, is the **reconciler** ([reconcile/loop.ts](reconcile/loop.ts)). It exists for two specific worries:

### Worry 1: "What if Polymarket changes its mind?"

Within those 48 hours, what if someone disputes the rain result and Polymarket flips it from YES to NO, or voids it entirely? We'd be about to forward a wrong answer to our smart contract.

The reconciler **re-checks every market we marked `POLYMARKET_RESOLVED`** but haven't yet forwarded on-chain. If Polymarket no longer agrees, we revert our database back to `PENDING` and log a loud warning.

### Worry 2: "Are any hedges stuck?"

Find every hedge that's been in `HEDGING` for more than 5 minutes. That should never happen. Log a warning so an engineer can investigate.

---

## Step 10 — Alice Cashes Out

Alice opens our app the day after the rain. She sees a **Claim** button.

She clicks it. The web app sends a request, and our smart contract's `claim` instruction runs:

```
✓ Is this market resolved?            yes
✓ Did the outcome Alice owns win?     yes (YES won, Alice has 10 YES)
✓ How many shares does she have?      10
```

The contract:

1. **Sets her share count to 0** (so she can't claim twice).
2. **Pays her 10 × $1 = $10** from the protocol's vault to her wallet.

Alice put in $5.10. She got back $10.00. **She made $4.90.**

---

## The Money Trail (Putting It All Together)

Let's follow the dollars through Alice's whole story:

| Event                                                            | Alice                 | Protocol Vault     | Polymarket Wallet                     |
| ---------------------------------------------------------------- | --------------------- | ------------------ | ------------------------------------- |
| Start                                                            | $100.00               | $0                 | $0                                    |
| Alice buys 10 YES at 51¢                                         | **−$5.10**            | **+$5.10**         | $0                                    |
| Hedger buys 10 YES on Polymarket at 50¢                          | $94.90                | −$5.00 → **$0.10** | **+$5.00** worth of Polymarket tokens |
| Time passes — it rains, market resolves YES                      | $94.90                | $0.10              | tokens are now worth **$10**          |
| Hedger redeems on Polygon                                        | $94.90                | $0.10              | **$10 cash**                          |
| (We move that $10 from Polymarket wallet → vault for accounting) | $94.90                | **$10.10**         | $0                                    |
| Alice claims her 10 winning shares                               | **+$10.00** = $104.90 | **$0.10**          | $0                                    |

**Bottom line:**

- Alice ended up with $104.90. She made $4.90 on her bet.
- Protocol vault ended up with $0.10. That 10¢ is the spread we baked into Alice's price (we charged her 51¢ when Polymarket was at 50¢).
- We took **zero directional risk**. Whether it rained or not, we made exactly 10¢.

That's the whole point of the hedger: **convert risky bets into a small predictable fee.**

---

## A Few Words You'll See in the Code

If you're reading the actual code, here are the unfamiliar terms in plain English:

| Word          | What it means                                                                                                                                 |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **PDA**       | A special Solana address derived from a recipe. The "vault" address, "market" address, and "user position" address are all PDAs.              |
| **CPI**       | When one Solana program calls another (like our contract calling the USDC token program to move money).                                       |
| **Nonce**     | A random number used as a unique ticket. Used once, then burned, so trades can't be replayed.                                                 |
| **Anchor**    | The Rust framework we use to write the Solana smart contract.                                                                                 |
| **BullMQ**    | A Node.js library that runs job queues backed by Redis. We use it to manage hedge jobs.                                                       |
| **FAK / IOC** | "Fill And Kill" / "Immediate Or Cancel" — an order that fills now or vanishes. We never leave orders resting on Polymarket.                   |
| **CTF token** | "Conditional Token Framework" — Polymarket's name for the tokens you get when you buy YES or NO. They're worth $1 if you're right, $0 if not. |
| **UMA**       | The decentralized oracle Polymarket uses to determine outcomes. Has a 48-hour dispute window.                                                 |
| **Cursor**    | Just a database row remembering "the last Solana transaction we processed". So we can resume after restart.                                   |

---

## TL;DR

Alice clicks Buy → server signs a price → her trade lands on Solana → Solana shouts an `OrderFilled` event → the hedger hears the shout → the hedger places the matching trade on Polymarket within milliseconds → Alice's risk is now hedged → much later, when the market resolves, Alice claims her winnings on Solana, and the hedger collects our matching winnings on Polygon. **Net effect: the protocol earns the small spread we baked into Alice's price, with no directional risk.**
