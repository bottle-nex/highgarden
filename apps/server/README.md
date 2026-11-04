# server

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.3.2. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## Security rollout

Deploy the additive database migration before starting the updated server and hedger.
Stop all old server/hedger instances before enabling traffic: old instances permit
unapproved transfers and price-based settlement. Deploy the web callback and server
together with SERVER_GOOGLE_CLIENT_ID equal to the web GOOGLE_CLIENT_ID. Configure
ADMIN_EMAILS with comma-separated owner emails; empty denies owner access.
All previous HTTP and WebSocket sessions are invalidated once by session version 2.
Users must sign in again; keep SERVER_KEY_ENCRYPTION_KEY and all existing accounts,
wallet ciphertext, balances, bets, claims and completed settlements unchanged.
Withdrawals require a separate emailed six-digit code (10 minutes, 5 attempts,
60-second resend delay). Signed transactions are persisted before submission; an
uncertain chain result stays pending and recovery resubmits only the identical
transaction. Definite failures need a new code. Email acceptance is retried durably
with increasing delay capped at one hour; it does not guarantee inbox delivery.
Run only one version of the settlement workers during rollout. Legacy pending
settlements require fresh CTF payout verification and the configured waiting period.
