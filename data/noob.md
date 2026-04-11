# Explaining "Unhedged Delta" Like You're a Noob

## First, what is our business, simply?

We are a **middleman**.

- Polymarket has a betting market: _"Will BTC hit $150k?"_ People there are buying and selling YES shares for 50¢.
- We copy that market onto Solana and show it to Solana users.
- When a Solana user buys from us at 51¢, we immediately go to Polymarket and buy the same thing for 50¢.
- We pocket the **1¢ difference**. That's our profit.

Think of it like a currency exchange at the airport. They buy dollars from you at ₹82 and sell them to other customers at ₹84. They don't care if the dollar goes up or down — they just want the ₹2 spread on every transaction.

**The whole game is: stay neutral, collect the spread.**

---

## What does "neutral" mean?

**Neutral = we don't care who wins the bet.**

Let's say Alice buys 100 YES from us at 51¢.

- She pays us $51.
- We promised her: _"If BTC hits $150k, I'll give you $100."_
- If BTC doesn't hit $150k, we keep her $51 and give her nothing.

Right now, **we are NOT neutral.** We are praying BTC doesn't hit $150k. If it does, we lose $49 ($100 payout − $51 we collected).

That's scary. We don't want to be gamblers.

So what do we do? **We go to Polymarket and buy 100 YES for $50.**

Now look at what we own:

- We owe Alice $100 _if YES wins_ (bad for us if YES wins).
- We own 100 YES shares on Polymarket that pay us $100 _if YES wins_ (good for us if YES wins).

These **cancel each other out**. If YES wins: we pay Alice $100, Polymarket pays us $100 → net $0. If YES loses: Alice gets nothing, our Polymarket shares are worth nothing → net $0.

And we collected $51 from Alice, paid $50 to Polymarket → **we keep $1 no matter what happens**.

**That's what neutral means. The bet is hedged. We don't care who wins.**

---

## Now the problem: those two things don't happen at the same time

Read this carefully, because this is the whole point.

**Step 1:** Alice clicks buy on our website. Her transaction goes onto Solana. ✅ Done in ~1 second.

**Step 2:** Our robot (the "hedging bot") sees Alice's trade and sends a buy order to Polymarket. ⏱️ This takes a few seconds — maybe 2, maybe 5, maybe 30 if Polymarket is slow.

**Between Step 1 and Step 2, we are NOT neutral.**

In that window:

- We owe Alice $100 if YES wins.
- We have NOT YET bought anything on Polymarket to protect ourselves.
- If BTC suddenly pumps right now, we're screwed.

That in-between state is what "unhedged" means.

> **Unhedged = we made a promise to a user, but we haven't protected ourselves yet.**

---

## Now "delta"

**Delta just means "how much money we could lose if things go wrong right now, while we're still unhedged."**

For Alice's trade:

- Max she can win = $100 (that's what we'd owe her).
- We already collected $51 from her.
- So in the absolute worst case, we're out $100 − $51 = $49.

Her trade contributes about **$100 of unhedged exposure** (we use the payout amount as a simple upper bound, because that's the scariest number).

**If we had only Alice's trade pending, our unhedged delta on this market = $100.**

Once the robot finishes buying on Polymarket, Alice's trade is now covered, and her $100 disappears from the "unhedged delta" counter. Back to $0.

---

## Why does the $500 cap exist?

Here's the thing. Alice isn't the only user. Users keep clicking buy.

Imagine this over 10 seconds:

| Time | What happens              | Unhedged delta      |
| ---- | ------------------------- | ------------------- |
| 0s   | Alice buys 100 YES        | $100                |
| 1s   | Bob buys 200 YES          | $300                |
| 2s   | Carol buys 150 YES        | $450                |
| 3s   | Dave tries to buy 100 YES | would go to $550 ❌ |

See what's happening? The robot hasn't finished hedging ANY of them yet. Every new user adds more unhedged exposure on top.

If we let this run forever with no limit:

- 20 users click buy in 30 seconds
- Robot is still catching up
- Suddenly we have **$10,000 of unhedged exposure**
- Polymarket has a hiccup and our robot can't finish hedging
- BTC pumps 20%
- **We just lost thousands of dollars.**

**The $500 cap is a safety valve that says: "Stop. We are not allowed to owe more than $500 of unprotected promises at any moment."**

When Dave tries to buy and it would push us over $500, our website literally refuses his order:

> _"Market temporarily unavailable. Please try again in a moment."_

Dave is annoyed for 2 seconds. Meanwhile the robot catches up, hedges Alice/Bob/Carol's trades, the counter drops back to $0, and Dave can now buy.

---

## The airport analogy again

Imagine the airport currency exchange again. They keep $10,000 cash in the drawer.

A customer walks up: _"I want to exchange $50,000."_

The cashier says: _"Sorry, I can only do $10,000 at a time."_

Why? Because the cashier needs to **walk to the bank next door to get more dollars** before they can do the next big trade. If they sold $50,000 they don't have, they'd be promising money they can't deliver.

**The $500 cap is our version of "how much we can promise before we need to pause and let the robot catch up."**

---

## Why $500 specifically?

It's a dial we pick. Bigger number = more trades we can accept at once, but more risk if things go wrong. Smaller number = safer, but we turn users away more often.

You'd pick it based on:

- **How fast is our robot?** If hedging takes 1 second, we can afford a bigger cap because we catch up quickly. If it takes 30 seconds, we need a smaller cap.
- **How much money do we have in total?** If our whole treasury is $5,000, losing $500 on one market is already 10% of everything. You wouldn't want the cap to be bigger than what you can afford to lose.
- **How crazy is the market?** For a calm market (election in 6 months), $500 is fine. For a wild market (Fed decision in 10 minutes), you might drop it to $100.

---

## In one sentence

> **"Unhedged delta"** is how much money we've promised users but haven't yet protected ourselves against. **The $500 cap** is the rule: _"We will never let that number go above $500 on a single market, because if everything goes wrong, that's the most we're willing to lose."_
