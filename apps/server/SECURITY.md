# Account and money authorization

Set `GOOGLE_CLIENT_ID` on the API to the same OAuth client ID used by the web app. Google sign-in fails closed if this is missing; email OTP sign-in remains available. The API verifies Google signatures, issuer, audience, expiry, and verified email, and ignores client-provided profile identity.

Set `ADMIN_EMAILS` on the API and web app to the same comma-separated owner email allowlist. An empty allowlist grants nobody owner access. Every `/admin` route requires a current session and an allowlisted email. Manual winner selection is disabled, including for owners; the existing automated resolvers settle markets from their upstream outcomes or price observations.

Deployment invalidates all sessions issued by the previous unverified sign-in flow. Users must sign in again. No user, wallet, bet, balance, or history records are migrated.

Withdrawals require an authenticated `POST /users/me/withdraw/request` with `destination` and `uiAmount`, followed by `POST /users/me/withdraw` with the same details and the emailed six-digit `code`. Codes expire after ten minutes, are scoped to the user and exact transfer details, and are consumed atomically before the transfer. Login codes cannot approve withdrawals. A failed transfer requires a new approval; new requests have a one-minute cooldown. Authenticated withdrawal requests and confirmations share the existing five-per-hour user limit.

Successful transfers send an email receipt with amount, destination, and transaction signature. Failed email deliveries remain in a Redis outbox and retry every minute, including after process restarts. Resend idempotency keys suppress duplicate receipts. Redis must retain its data across restarts. If Redis fails after the on-chain transfer, the API logs the receipt persistence failure with its signature; it still reports the completed transfer successfully so the user does not retry a completed withdrawal. There remains a crash window between chain confirmation and outbox persistence; fully transactional delivery across Solana and Redis would require reconciliation against chain history.
