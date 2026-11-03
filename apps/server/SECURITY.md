# Account and funds protection

Set `SERVER_GOOGLE_CLIENT_ID` to the web app's `GOOGLE_CLIENT_ID` in the server environment. Google login fails closed when this is empty or identity verification is unavailable. The backend verifies the supplied Google ID token with Google and checks its audience, issuer, expiry and verified email before looking up an account.

Set `ADMIN_EMAILS` in the server environment to the comma-separated owner email allowlist used by the web app. An empty list grants no owner access. Every admin endpoint requires both a verified session and an allowlisted email.

Sessions issued before the verified-identity issuer was introduced are rejected. Users must sign in again; no account, wallet, balance, bet or history migration is required.

Withdrawals require a separate email confirmation code. Request it with `POST /api/v1/users/me/withdraw/request` and the destination and uiAmount. Submit the same details and the six-digit `code` to `POST /api/v1/users/me/withdraw`. Codes expire using the OTP TTL, have bounded attempts, are consumed atomically, and cannot authorize a different transfer or be used to sign in. A failed transfer requires a new confirmation code.

After a successful transfer, the server emails its amount, destination and transaction signature. Delivery is attempted three times; failures are logged with the signature and the response includes `notificationSent: false`. Operators must investigate these logs; email delivery is not guaranteed during a provider outage.

The manual resolution HTTP endpoint returns 409, including for owners. Settlement remains with the existing event resolver services; HTTP callers cannot select a winner.
