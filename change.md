# Auth-Optional Socket + Sign-In Modal — Change Log

## What this change does, in one paragraph

Before this change, an unauthenticated visitor could not connect to our
WebSocket at all — the server rejected the upgrade with 401 if they had no
JWT. That meant the orderbook on event/market pages went stale for guests,
and the only way to interact with the platform was to sign in first.

After this change, the platform behaves like Polymarket / Kalshi / Binance:
**anyone can browse the dashboard and event pages with live, streaming market
data**, and the sign-in prompt only appears when the user tries to do
something private — trade, view portfolio, or deposit. Sign-in opens as a
**modal** on the current page (no full-page redirect), so users keep their
context.

We also added the production guardrails that come with opening a socket to
the public internet: origin checking, per-IP connection caps, per-socket
subscription caps, and a snapshot cache to prevent us from accidentally DoS-ing
clob.polymarket.com when many guests subscribe at once.

---

## Files changed

### 1. `packages/types/src/socket/index.ts`

**Why:** Allow `ws.user` to be `null` so the type system can represent guest
(unauthenticated) sockets.

**What:** Changed `CustomWebSocketFields.user` from `UserSocketPayload` to
`UserSocketPayload | null`. Added a comment explaining: when user is null,
only public market-data channels may be subscribed.

---

### 2. `apps/server/socket/socket.server.ts` (main server change)

This is the biggest file in the change. Five things happened here:

**a) Auth is now optional at upgrade time.**

The previous code rejected any upgrade without a valid JWT. Now we call
`authenticate(req)` and if it returns null, we attach `ws.user = null`
(guest) instead of closing the connection. Subscribing to public channels
works for both authed users and guests.

When user-specific channels are added later (e.g. `user.fills`), the comment
in `handle_subscribe` flags exactly where to add the gate:
`if (channel.is_user_scoped && !ws.user) reject`.

**b) Origin check.**

Each upgrade reads `req.headers.origin` and rejects with 403 if it isn't on
the allowlist. The allowlist is built from:

- `ENV.SERVER_WEB_ORIGIN` (the primary frontend URL)
- `SERVER_WS_ALLOWED_ORIGINS` env var (comma-separated extras for staging /
  preview deploys)
- `localhost:3000` and `127.0.0.1:3000` outside production

Without this guard, anyone could build a scraper or 3rd-party site against
our socket. Browsers always send `Origin`; non-browser clients (curl, custom
scripts) only succeed when not in production.

**c) Per-IP connection cap.**

A `Map<ip, count>` tracks concurrent connections per IP. New upgrades get
429'd if the IP is already at the cap (default 10, configurable via
`SERVER_WS_MAX_CONN_PER_IP`). The counter is decremented on every close so
legitimate users can reconnect after disconnects. IP detection honors
`x-forwarded-for` for proxy / load-balancer setups.

This stops one bad actor from opening 50,000 guest sockets and exhausting
file descriptors.

**d) Per-socket subscription cap.**

Each socket can subscribe to at most 50 token IDs (configurable via
`SERVER_WS_MAX_SUBS_PER_SOCKET`). Overflow gets a structured error message
back. Without this, a malicious client could `SUBSCRIBE` thousands of
tokens and balloon Redis subscriber memory and bandwidth.

**e) Snapshot cache for `clob.polymarket.com/book` fetch.**

The original code hit `https://clob.polymarket.com/book?token_id=...` on
**every** subscribe. With public traffic, that turns our subscribe endpoint
into a DoS amplifier against Polymarket — and they will rate-limit us.

Now there's an in-memory `snapshot_cache: Map<token_id, SnapshotEntry>`
with:

- 1.5s TTL (configurable via `SERVER_WS_SNAPSHOT_TTL_MS`)
- Promise coalescing: concurrent calls for the same token await the same
  in-flight promise, so a burst of N subscribes triggers exactly **one**
  upstream fetch.

Cached snapshots are fully type-safe — we declare `BookSnapshotPayload`
explicitly rather than passing through `unknown`.

**f) Null-safe logging and eviction.**

Every place that previously read `ws.user.email` now uses a `label_for(ws)`
helper that returns either the email or `"guest"`. The single-session-per-email
eviction (`evict_existing`) only runs for authed users — guests have no
identity to dedupe.

---

### 3. `apps/web/src/lib/socket/singleton-socket.ts`

**Why:** The client socket needs to (a) connect without a token for guests
and (b) cleanly swap connections when the user signs in or out without
losing the React StrictMode safety net.

**What:**

- `acquire(token)` now accepts `string | null`. If null, the URL is built
  without the `?token=` query parameter — the server reads no token and
  treats it as a guest.
- A new `current_token` field tracks which token the live socket was
  opened with. When `acquire()` is called with a different token (sign-in
  or sign-out), we synchronously close the old client, reset the stream
  store, and open a new one. The client's own `active_subscriptions` are
  replayed on the new connection through the existing `replay_subscriptions`
  mechanism, but since this is a session swap the React-level
  `useMarketStream` re-subscribes anyway through hook dep changes.

---

### 4. `apps/web/src/lib/socket/useWebSocket.ts`

**Why:** The hook used to bail with `if (!token) return;`, which meant
guests never had `subscribe_market` available — so even though the socket
could now connect, no React component could subscribe through it.

**What:** Removed the early-bail. The effect now always acquires the
singleton (with whatever token, including null). The `client` derivation
no longer requires a token — only that status is not idle/closed.

This is the change that actually delivers live orderbook updates to guests.

---

### 5. `apps/web/src/components/utility/WebSocketHost.tsx`

**Why:** Mirrors the change in `useWebSocket` — the host that holds the
app-level refcount needs to acquire even when the user is signed out, so
the singleton stays alive across page navigations.

**What:** Removed the `if (!token) return;` guard. Acquires unconditionally;
the singleton handles auth/guest swaps internally. Also updated the JSDoc
comment to explain the new contract (guests get public market data).

---

### 6. `apps/web/src/components/auth/SignInModal.tsx` (new file)

**Why:** Today, sign-in is a full page at `/signin` — clicking sign-in
forces the user to lose their context (e.g. they were looking at an event,
now they're on a blank auth page). A modal lets us trigger sign-in over
the current page.

**What:** Extracted the `/signin` page UI into a standalone modal component.

- Reads `openSigninModal` from `useUserSessionStore` (which already exists
  and is already used by other parts of the codebase — no new store needed).
- Auto-closes when the user becomes authenticated (via an effect watching
  `session`).
- Google OAuth: returns to the **current URL** as `callbackUrl` (not `/`),
  so users land back where they started.
- Email-OTP: stays on the same route; the modal closes itself when the
  session arrives.
- The original `/signin` page is preserved untouched, for direct URL
  visits and for any code path that prefers the full-page experience.

---

### 7. `apps/web/app/layout.tsx`

**Why:** The modal needs to be mounted somewhere so it's available app-wide.

**What:** Added `import SignInModal` and rendered `<SignInModal />` inside
the auth provider. It's invisible until `openSigninModal` becomes true.

---

### 8. `apps/web/src/hooks/useRequireAuth.ts` (new file)

**Why:** A common pattern across many components — "if user is logged in,
do X; otherwise show sign-in." Centralizing this avoids copying the same
4-line snippet everywhere.

**What:** Tiny hook that returns a function:

- `requireAuth(action)` — runs `action()` if signed in, opens modal otherwise.
- Returns `true`/`false` so callers can early-return inside async handlers.

---

### 9. `apps/web/src/components/hero/LandingCtaSection.tsx`

**Why:** The `START TRADING` button on the landing page had no `onClick` —
it didn't navigate anywhere. The user's primary CTA needs to actually go
somewhere.

**What:** Hooked it up to `router.push('/dashboard')`. Both the outer
container (the GET STARTED card) and the inner button navigate to the
dashboard. Keyboard accessibility added (Enter/Space).

Per the user's spec: this navigation does NOT require auth. Anyone can
browse the dashboard.

---

### 10. `apps/web/src/components/event/EventTradePanel.tsx`

**Why:** This is the real trading panel — the buy/sell submit handler
needs to gate on auth.

**What:** Added the `useRequireAuth()` hook, called it at the top of
`handle_submit`. If the user isn't signed in, the modal opens and the
trade attempt is aborted before any API call. If they are, the existing
flow runs unchanged. (Server-side `requireAuth` middleware on the trade
endpoint is the real security boundary; this is just better UX than a
401 toast.)

---

### 11. `apps/web/src/components/market/TradingPanel.tsx`

**Why:** Legacy market detail trading panel. Even though it doesn't have
a real submit handler today, the trade button should still gate on auth.

**What:** Added `useRequireAuth()` and wired `onClick={() => requireAuth()}`
on the trade button. When sign-in is added later, the gate is already in
place.

---

### 12. `apps/web/src/components/dashboard/DashboardNavbar.tsx`

**Why:** The navbar was the place users hit Deposit / Portfolio. Today,
the Deposit button just opened the dialog regardless of auth (the dialog
internally fails on missing wallet); the Portfolio button did nothing at
all. Plus, signed-out users had no way to sign in from the navbar.

**What:**

- **Deposit** → wraps the existing handler in `requireAuth()`. Signed-out
  users see the modal instead of a broken dialog.
- **Portfolio** → wraps `router.push('/portfolio')` in `requireAuth()`.
  Signed-out users see the modal.
- **User avatar / Sign-in button** — when signed in, shows the avatar
  (existing). When signed out, shows a "Sign in" button that opens the
  modal directly. So the dashboard now works gracefully for guests AND
  signed-in users without a hard redirect to `/signin`.

---

### 13. `apps/web/proxy.ts` (NextAuth edge middleware)

**Why:** This file (Next.js's renamed `middleware.ts`) was using a
**deny-list matcher** that auth-walled every route except a small handful
(`signin`, `api/auth`, root, static assets). With `withAuth`'s
`authorized: ({ token }) => !!token` callback, every signed-out visitor to
`/dashboard`, `/event/...`, `/market/...` was being auto-redirected to
`/signin?callbackUrl=...` by NextAuth — directly contradicting the goal of
this change (public browsing with modal-on-action sign-in).

**What:** Flipped the matcher from a deny list to an **allow list** that
only auth-walls genuinely user-specific routes:

```ts
matcher: ['/admin/:path*', '/portfolio/:path*', '/bookmarks/:path*'],
```

- `/admin/*` — still token-required and admin-email-required (existing
  in-middleware logic preserved).
- `/portfolio/*` — token-required (user's own positions; non-trivial to
  show empty-state for guests).
- `/bookmarks/*` — token-required for the same reason.
- Every other route (`/`, `/dashboard`, `/event/*`, `/market/*`, `/legal/*`,
  etc.) is **publicly accessible**. Any auth-required action on those pages
  now opens the in-page sign-in modal via `useRequireAuth()` instead of a
  redirect.

This is the actual fix that makes the rest of this PR work end-to-end —
without it, the `START TRADING` CTA would still kick guests to `/signin`
because the edge middleware ran before the page could render.

---

### 14. `turbo.json`

**Why:** The new env vars must be declared so turbo's lint rule
(`turbo/no-undeclared-env-vars`) doesn't flag them, which would cause
`bun run lint` to fail.

**What:** Added the four new env var names to `globalEnv`:

- `SERVER_WS_MAX_CONN_PER_IP`
- `SERVER_WS_MAX_SUBS_PER_SOCKET`
- `SERVER_WS_SNAPSHOT_TTL_MS`
- `SERVER_WS_ALLOWED_ORIGINS`

All four are optional (have sensible defaults in code).

---

## What does NOT need to change (and why)

- **`apps/mirror`** — Mirror only publishes to Redis. The auth boundary lives
  entirely on the server-to-client side. Mirror is untouched.
- **REST API endpoints** — Read-only endpoints (`GET /markets`,
  `/orderbook`, `/trades`, etc.) were already public. Write endpoints
  (`POST /place-order`, `/quote`, `/comments`) already use `requireAuth`
  middleware. The auth boundary is unchanged at the HTTP level.
- **Existing modal-trigger callers** — `BookmarkedMarkets`,
  `EventTitleBlock`, `EventBalanceStrip` were already using
  `setOpenSigninModal(true)`. They now work properly because the modal
  actually exists and is mounted.
- **The original `/signin` page** — kept as-is. Useful for direct URL
  links, OAuth fallback, and any future flow that prefers a full page.

---

## Existing behavior preserved

Things that worked before still work the same way:

- Authed users connect to the WS with their JWT, identical to before.
- Single-session-per-email eviction still applies to authed users.
- Reconnect logic in `WebSocketClient` (exponential backoff, persistent
  mode, subscription replay) is unchanged.
- The `/signin` page still works for direct visits.
- The `useUserSessionStore.openSigninModal` flag was already being set by
  some components (bookmarks, event title) — those continue to work, and
  now actually pop the modal because it's mounted.

---

## New environment variables (all optional, have defaults)

| Variable                        | Default | Purpose                                                                         |
| ------------------------------- | ------- | ------------------------------------------------------------------------------- |
| `SERVER_WS_MAX_CONN_PER_IP`     | `10`    | Max concurrent WS connections from a single IP.                                 |
| `SERVER_WS_MAX_SUBS_PER_SOCKET` | `50`    | Max channel subscriptions per socket.                                           |
| `SERVER_WS_SNAPSHOT_TTL_MS`     | `1500`  | TTL for the orderbook snapshot cache.                                           |
| `SERVER_WS_ALLOWED_ORIGINS`     | `""`    | Comma-separated extra origins (beyond `SERVER_WEB_ORIGIN`). Useful for staging. |

---

## Verification

- `bun run check-types` (web) — ✅ passes
- `bun run typecheck` (server) — ✅ passes
- `bun run lint` (server) — ✅ passes (after turbo.json update)
- `bun run lint` (web) — ✅ passes (the two warnings present are pre-existing
  in files this change did not touch).

---

## How a user experiences this now

**Signed-out user, fresh visit:**

1. Lands on `/`. Sees the landing page exactly as before.
2. Clicks `START TRADING` → goes to `/dashboard`. Sees all markets with
   live data (REST + socket both work for guests).
3. Clicks an event. Sees orderbook, prices, recent trades — all live and
   updating because the socket is connected as a guest.
4. Tries to click "Buy" → sign-in modal pops up over the current page.
5. Signs in via Google or email-OTP. Modal closes itself. Socket
   transparently reconnects with the new JWT. They click Buy again — now
   it goes through.

**Signed-in user, returning:**

Identical to before. They never see the modal. The socket connects with
their token at app startup, just like before.

**Bad actor:**

- Tries to scrape from a non-allowed origin → 403 at upgrade.
- Tries to open 50 connections from one IP → 429 after 10.
- Tries to subscribe to 10,000 tokens on one socket → error after 50.
- Bursts of subscribes for the same token → only one upstream fetch.
