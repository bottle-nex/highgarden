# Polymarket WSS Mirror — Hand-Write Guide

This doc contains **every file you need to write**, with full code, in the order you should write them. Read top to bottom; each section explains _why_ before giving the code so you can learn the shape as you type.

---

## Context

You're building a backend service that:

1. Opens a persistent WebSocket to Polymarket (`wss://ws-subscriptions-clob.polymarket.com/ws/`).
2. Subscribes to a tokenId **only when some consumer asks for it**, and **only once** regardless of how many consumers want it (refcount).
3. Fans out every market update to Redis pub/sub so the rest of the app is decoupled from the WSS connection.
4. Also runs a second authenticated socket (`user` channel) for your own order/trade stream — used later by the hedging bot.

Everything lives inside `apps/server` and boots from the existing `Services` singleton. Consumers talk to the mirror **only** by publishing to a Redis control channel — no direct imports, no shared state.

**Runtime is Bun**, so you use the built-in global `WebSocket` class. No `ws` package.

---

## File Structure

```
apps/server/
├── index.ts                                   # MODIFY — call services.polymarket.start(), wire SIGTERM
├── config/
│   └── config.env.ts                          # MODIFY — add SERVER_POLYMARKET_WS_URL
├── services/
│   ├── service.singleton.ts                   # MODIFY — instantiate PolymarketService
│   └── polymarket/
│       ├── config.polymarket.ts               # NEW — URLs, timings, channel builders
│       ├── types.polymarket.ts                # NEW — message shapes
│       ├── auth.polymarket.ts                 # NEW — HMAC creds helper
│       ├── publisher.polymarket.ts            # NEW — redis.publish wrappers
│       ├── subscription.registry.ts           # NEW — tokenId refcount
│       ├── socket.base.ts                     # NEW — abstract: connect/reconnect/heartbeat
│       ├── socket.market.ts                   # NEW — market channel + registry
│       ├── socket.user.ts                     # NEW — user channel with auth
│       ├── control.listener.ts                # NEW — ioredis subscriber on control channel
│       └── service.polymarket.ts              # NEW — top-level façade
```

Write them in the order above. Each file only imports from files written before it, so the TypeScript errors clear as you go.

---

## Step 0 — Extend the env schema

**`apps/server/config/config.env.ts`** — add one line to the Zod schema and the exported `ENV` object:

```ts
// inside the z.object({ ... }) schema
SERVER_POLYMARKET_WS_URL: z
  .string()
  .url()
  .default("wss://ws-subscriptions-clob.polymarket.com/ws/"),
```

The three HMAC vars (`SERVER_POLYMARKET_API_KEY`, `SERVER_POLYMARKET_SECRET`, `SERVER_POLYMARKET_PASSPHRASE`) already exist in `.env` — just make sure they're in the schema too, marked `.optional()` so the app still boots without the user channel.

---

## Step 1 — `services/polymarket/config.polymarket.ts`

**Why:** one place for every magic string and timing. Keeps the other files clean.

```ts
import { ENV } from "../../config/config.env";

export const POLY_WS = {
  baseUrl: ENV.SERVER_POLYMARKET_WS_URL,
  marketPath: "market",
  userPath: "user",

  // Polymarket closes idle sockets quickly. Ping well before that.
  heartbeatMs: 5_000,

  // Exponential backoff for reconnects.
  reconnectInitialMs: 1_000,
  reconnectMaxMs: 30_000,
} as const;

export const REDIS_CHANNELS = {
  control: "polymarket:control",
  status: "polymarket:status",
  marketBook: (tokenId: string) => `polymarket:market:book:${tokenId}`,
  marketPrice: (tokenId: string) => `polymarket:market:price:${tokenId}`,
  marketTick: (tokenId: string) => `polymarket:market:tick:${tokenId}`,
  userTrade: "polymarket:user:trade",
  userOrder: "polymarket:user:order",
} as const;
```

---

## Step 2 — `services/polymarket/types.polymarket.ts`

**Why:** make the message shapes explicit so `handleMessage` can narrow safely.

```ts
export type MarketEvent =
  | {
      event_type: "book";
      asset_id: string;
      market: string;
      bids: Array<{ price: string; size: string }>;
      asks: Array<{ price: string; size: string }>;
      timestamp: string;
      hash: string;
    }
  | {
      event_type: "price_change";
      asset_id: string;
      market: string;
      changes: Array<{ price: string; side: "BUY" | "SELL"; size: string }>;
      timestamp: string;
    }
  | {
      event_type: "tick_size_change";
      asset_id: string;
      market: string;
      old_tick_size: string;
      new_tick_size: string;
      timestamp: string;
    };

export type UserEvent =
  | { event_type: "trade"; [k: string]: unknown }
  | { event_type: "order"; [k: string]: unknown };

export type ControlMessage =
  | { action: "subscribe"; tokenId: string; consumerId?: string }
  | { action: "unsubscribe"; tokenId: string; consumerId?: string };

export type SocketState = "idle" | "connecting" | "open" | "closing" | "closed" | "reconnecting";
```

---

## Step 3 — `services/polymarket/auth.polymarket.ts`

**Why:** user channel subscribe frame needs credentials. Centralize the check and the shape.

```ts
import { ENV } from "../../config/config.env";

export type PolyAuth = {
  apiKey: string;
  secret: string;
  passphrase: string;
};

export function hasPolymarketCreds(): boolean {
  return Boolean(
    ENV.SERVER_POLYMARKET_API_KEY &&
    ENV.SERVER_POLYMARKET_SECRET &&
    ENV.SERVER_POLYMARKET_PASSPHRASE,
  );
}

export function buildPolymarketAuth(): PolyAuth {
  if (!hasPolymarketCreds()) {
    throw new Error("polymarket creds missing — cannot build auth");
  }
  return {
    apiKey: ENV.SERVER_POLYMARKET_API_KEY!,
    secret: ENV.SERVER_POLYMARKET_SECRET!,
    passphrase: ENV.SERVER_POLYMARKET_PASSPHRASE!,
  };
}
```

> **Note:** confirm field names (`apiKey` vs `api_key`) against Polymarket's current docs when you test. They've changed this historically.

---

## Step 4 — `services/polymarket/publisher.polymarket.ts`

**Why:** the only place that calls `redis.publish`. Makes channels and JSON encoding impossible to typo.

```ts
import type Redis from "ioredis";
import { REDIS_CHANNELS } from "./config.polymarket";
import type { MarketEvent, UserEvent } from "./types.polymarket";

export class PolymarketPublisher {
  constructor(private redis: Redis) {}

  async publishMarket(ev: MarketEvent) {
    const payload = JSON.stringify(ev);
    switch (ev.event_type) {
      case "book":
        await this.redis.publish(REDIS_CHANNELS.marketBook(ev.asset_id), payload);
        return;
      case "price_change":
        await this.redis.publish(REDIS_CHANNELS.marketPrice(ev.asset_id), payload);
        return;
      case "tick_size_change":
        await this.redis.publish(REDIS_CHANNELS.marketTick(ev.asset_id), payload);
        return;
    }
  }

  async publishUser(ev: UserEvent) {
    const payload = JSON.stringify(ev);
    if (ev.event_type === "trade") {
      await this.redis.publish(REDIS_CHANNELS.userTrade, payload);
    } else if (ev.event_type === "order") {
      await this.redis.publish(REDIS_CHANNELS.userOrder, payload);
    }
  }

  async publishStatus(socket: "market" | "user", state: string) {
    await this.redis.publish(
      REDIS_CHANNELS.status,
      JSON.stringify({ socket, state, at: Date.now() }),
    );
  }
}
```

---

## Step 5 — `services/polymarket/subscription.registry.ts`

**Why:** single source of truth for "which tokenIds does the market socket care about". Pure in-memory — no I/O, easy to test.

`firstRef` / `lastRef` tell the caller whether to send a WSS frame.

```ts
export type AcquireResult = { firstRef: boolean; count: number };
export type ReleaseResult = { lastRef: boolean; count: number };

export class SubscriptionRegistry {
  private counts = new Map<string, number>();

  acquire(tokenId: string): AcquireResult {
    const prev = this.counts.get(tokenId) ?? 0;
    const next = prev + 1;
    this.counts.set(tokenId, next);
    return { firstRef: prev === 0, count: next };
  }

  release(tokenId: string): ReleaseResult {
    const prev = this.counts.get(tokenId) ?? 0;
    if (prev <= 0) return { lastRef: false, count: 0 };
    const next = prev - 1;
    if (next === 0) {
      this.counts.delete(tokenId);
      return { lastRef: true, count: 0 };
    }
    this.counts.set(tokenId, next);
    return { lastRef: false, count: next };
  }

  snapshot(): string[] {
    return Array.from(this.counts.keys());
  }

  has(tokenId: string): boolean {
    return this.counts.has(tokenId);
  }

  size(): number {
    return this.counts.size;
  }
}
```

---

## Step 6 — `services/polymarket/socket.base.ts`

**Why:** every socket has the same reconnect / heartbeat / state-machine needs. Put it here once; subclasses only implement channel-specific behavior.

Key ideas:

- The heartbeat starts on `open`, clears on `close`.
- Reconnect backoff doubles each failure, caps at `reconnectMaxMs`, resets on successful `open`.
- `send()` queues if the socket isn't open yet, flushes on `open`.
- `stop()` sets a `stopped` flag so the `close` handler doesn't reconnect.
- On `open`, we call `getSubscribeFrame()` — subclasses return their full current subscription set, so reconnects automatically restore state without any queue.

```ts
import type { PolymarketPublisher } from "./publisher.polymarket";
import { POLY_WS } from "./config.polymarket";
import type { SocketState } from "./types.polymarket";

export abstract class SocketBase {
  protected ws: WebSocket | null = null;
  protected state: SocketState = "idle";
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = POLY_WS.reconnectInitialMs;
  private sendQueue: string[] = [];
  private stopped = false;

  constructor(
    protected readonly name: "market" | "user",
    protected readonly publisher: PolymarketPublisher,
  ) {}

  protected abstract getUrl(): string;
  protected abstract getSubscribeFrame(): object | null;
  protected abstract handleMessage(msg: unknown): void;

  async connect(): Promise<void> {
    if (this.state === "open" || this.state === "connecting") return;
    this.stopped = false;
    this.setState("connecting");

    try {
      this.ws = new WebSocket(this.getUrl());
    } catch (err) {
      console.error(`[poly:${this.name}] ctor failed`, err);
      this.scheduleReconnect();
      return;
    }

    this.ws.addEventListener("open", () => this.onOpen());
    this.ws.addEventListener("message", (ev) => this.onMessage(ev.data));
    this.ws.addEventListener("close", (ev) => this.onClose(ev.code, ev.reason));
    this.ws.addEventListener("error", (err) => {
      console.error(`[poly:${this.name}] error`, err);
    });
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.clearTimers();
    this.setState("closing");
    try {
      this.ws?.close(1000, "shutdown");
    } catch {}
    this.ws = null;
    this.setState("closed");
  }

  protected send(payload: object) {
    const raw = JSON.stringify(payload);
    if (this.state === "open" && this.ws) {
      this.ws.send(raw);
    } else {
      this.sendQueue.push(raw);
    }
  }

  private onOpen() {
    this.setState("open");
    this.reconnectDelay = POLY_WS.reconnectInitialMs;

    const frame = this.getSubscribeFrame();
    if (frame) {
      this.ws!.send(JSON.stringify(frame));
    }

    while (this.sendQueue.length > 0 && this.ws) {
      this.ws.send(this.sendQueue.shift()!);
    }

    this.heartbeatTimer = setInterval(() => {
      try {
        this.ws?.send("PING");
      } catch {}
    }, POLY_WS.heartbeatMs);
  }

  private onMessage(data: unknown) {
    if (typeof data !== "string") return;
    if (data === "PONG" || data === "pong") return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    if (Array.isArray(parsed)) {
      for (const item of parsed) this.handleMessage(item);
    } else {
      this.handleMessage(parsed);
    }
  }

  private onClose(code: number, reason: string) {
    console.warn(`[poly:${this.name}] closed`, { code, reason });
    this.clearTimers();
    this.ws = null;
    if (this.stopped) {
      this.setState("closed");
      return;
    }
    this.scheduleReconnect();
  }

  private scheduleReconnect() {
    this.setState("reconnecting");
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(delay * 2, POLY_WS.reconnectMaxMs);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private clearTimers() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.heartbeatTimer = null;
    this.reconnectTimer = null;
  }

  private setState(next: SocketState) {
    this.state = next;
    void this.publisher.publishStatus(this.name, next);
  }
}
```

---

## Step 7 — `services/polymarket/socket.market.ts`

**Why:** this is the whole point of the service. Owns the registry, dedups `SUBSCRIBE` frames, and re-sends the full set on reconnect.

```ts
import { SocketBase } from "./socket.base";
import { SubscriptionRegistry } from "./subscription.registry";
import { POLY_WS } from "./config.polymarket";
import type { MarketEvent } from "./types.polymarket";
import type { PolymarketPublisher } from "./publisher.polymarket";

export class MarketSocket extends SocketBase {
  readonly registry = new SubscriptionRegistry();

  constructor(publisher: PolymarketPublisher) {
    super("market", publisher);
  }

  protected getUrl(): string {
    return POLY_WS.baseUrl + POLY_WS.marketPath;
  }

  protected getSubscribeFrame(): object | null {
    const assets_ids = this.registry.snapshot();
    if (assets_ids.length === 0) return null;
    return { type: "MARKET", assets_ids };
  }

  subscribe(tokenId: string): void {
    const { firstRef, count } = this.registry.acquire(tokenId);
    console.log(`[poly:market] acquire ${tokenId} (count=${count}, firstRef=${firstRef})`);
    if (firstRef && this.state === "open") {
      this.send({ type: "MARKET", assets_ids: [tokenId] });
    }
  }

  unsubscribe(tokenId: string): void {
    const { lastRef, count } = this.registry.release(tokenId);
    console.log(`[poly:market] release ${tokenId} (count=${count}, lastRef=${lastRef})`);
    // v1: no explicit unsubscribe frame. If bandwidth becomes an issue,
    // force-reconnect here when lastRef is true and getSubscribeFrame will
    // re-send the smaller set.
  }

  protected handleMessage(msg: unknown): void {
    if (!isMarketEvent(msg)) return;
    void this.publisher.publishMarket(msg);
  }
}

function isMarketEvent(msg: unknown): msg is MarketEvent {
  if (!msg || typeof msg !== "object") return false;
  const t = (msg as { event_type?: unknown }).event_type;
  return t === "book" || t === "price_change" || t === "tick_size_change";
}
```

---

## Step 8 — `services/polymarket/socket.user.ts`

**Why:** authenticated stream for your own trades and orders. Needs the HMAC creds in the subscribe frame. Market condition IDs are pulled from the DB once at startup; the same query runs on every reconnect so new markets are picked up.

```ts
import { SocketBase } from "./socket.base";
import { POLY_WS } from "./config.polymarket";
import { buildPolymarketAuth } from "./auth.polymarket";
import type { UserEvent } from "./types.polymarket";
import type { PolymarketPublisher } from "./publisher.polymarket";

export type UserMarketsProvider = () => Promise<string[]>;

export class UserSocket extends SocketBase {
  private markets: string[] = [];

  constructor(
    publisher: PolymarketPublisher,
    private readonly loadMarkets: UserMarketsProvider,
  ) {
    super("user", publisher);
  }

  protected getUrl(): string {
    return POLY_WS.baseUrl + POLY_WS.userPath;
  }

  protected getSubscribeFrame(): object | null {
    if (this.markets.length === 0) return null;
    const auth = buildPolymarketAuth();
    return { type: "USER", markets: this.markets, auth };
  }

  async connect(): Promise<void> {
    // Refresh the markets list before each connect so reconnects pick up new markets.
    try {
      this.markets = await this.loadMarkets();
    } catch (err) {
      console.error("[poly:user] loadMarkets failed", err);
      this.markets = [];
    }
    await super.connect();
  }

  protected handleMessage(msg: unknown): void {
    if (!isUserEvent(msg)) return;
    void this.publisher.publishUser(msg);
  }
}

function isUserEvent(msg: unknown): msg is UserEvent {
  if (!msg || typeof msg !== "object") return false;
  const t = (msg as { event_type?: unknown }).event_type;
  return t === "trade" || t === "order";
}
```

---

## Step 9 — `services/polymarket/control.listener.ts`

**Why:** ioredis requires a dedicated client for `SUBSCRIBE` mode — you can't reuse `services.redis`. This class owns its own connection and hands parsed messages to the market socket.

```ts
import Redis from "ioredis";
import { ENV } from "../../config/config.env";
import { REDIS_CHANNELS } from "./config.polymarket";
import type { ControlMessage } from "./types.polymarket";
import type { MarketSocket } from "./socket.market";

export class ControlListener {
  private sub: Redis | null = null;

  constructor(private readonly market: MarketSocket) {}

  async start(): Promise<void> {
    this.sub = new Redis(ENV.SERVER_REDIS_URL);
    await this.sub.subscribe(REDIS_CHANNELS.control);
    this.sub.on("message", (_channel, raw) => this.handle(raw));
    console.log(`[poly:control] subscribed to ${REDIS_CHANNELS.control}`);
  }

  async stop(): Promise<void> {
    await this.sub?.quit();
    this.sub = null;
  }

  private handle(raw: string): void {
    const parsed = this.parse(raw);
    if (!parsed) {
      console.warn("[poly:control] bad message", raw);
      return;
    }
    if (parsed.action === "subscribe") {
      this.market.subscribe(parsed.tokenId);
    } else {
      this.market.unsubscribe(parsed.tokenId);
    }
  }

  private parse(raw: string): ControlMessage | null {
    try {
      const o = JSON.parse(raw) as Partial<ControlMessage>;
      if (typeof o?.tokenId !== "string") return null;
      if (o.action !== "subscribe" && o.action !== "unsubscribe") return null;
      return { action: o.action, tokenId: o.tokenId, consumerId: o.consumerId };
    } catch {
      return null;
    }
  }
}
```

---

## Step 10 — `services/polymarket/service.polymarket.ts`

**Why:** façade the rest of the app touches. Hides the fact that there are two sockets and a control listener.

```ts
import type Redis from "ioredis";
import { PolymarketPublisher } from "./publisher.polymarket";
import { MarketSocket } from "./socket.market";
import { UserSocket, type UserMarketsProvider } from "./socket.user";
import { ControlListener } from "./control.listener";
import { hasPolymarketCreds } from "./auth.polymarket";

export class PolymarketService {
  private publisher: PolymarketPublisher;
  private market!: MarketSocket;
  private user?: UserSocket;
  private control!: ControlListener;

  constructor(
    redis: Redis,
    private readonly loadUserMarkets: UserMarketsProvider,
  ) {
    this.publisher = new PolymarketPublisher(redis);
  }

  async start(): Promise<void> {
    this.market = new MarketSocket(this.publisher);
    this.control = new ControlListener(this.market);

    await this.market.connect();
    await this.control.start();

    if (hasPolymarketCreds()) {
      this.user = new UserSocket(this.publisher, this.loadUserMarkets);
      await this.user.connect();
    } else {
      console.warn("[poly] skipping user socket — no credentials");
    }
  }

  async stop(): Promise<void> {
    await this.control?.stop();
    await this.market?.stop();
    await this.user?.stop();
  }
}
```

---

## Step 11 — Wire into `services/service.singleton.ts`

**Why:** the rest of the app already treats `services` as the global bag of services. Add `polymarket` alongside `redis`.

The `loadUserMarkets` closure is where you'd query Prisma for active markets. Keep it a stub for now — just return `[]` — until the hedging bot needs it.

```ts
import Redis from "ioredis";
import { ENV } from "../config/config.env";
import { PolymarketService } from "./polymarket/service.polymarket";

export default class Services {
  public redis!: Redis;
  public polymarket!: PolymarketService;

  public boot() {
    this.redis = new Redis(ENV.SERVER_REDIS_URL);
    this.polymarket = new PolymarketService(this.redis, async () => {
      // TODO: query prisma.polyMarket for active market condition ids
      return [];
    });
  }
}
```

---

## Step 12 — Wire into `index.ts`

**Why:** boot the sockets before `app.listen` and tear them down cleanly on SIGTERM.

```ts
import cors from "cors";
import express from "express";
import v1_router from "./routers/v1/router.v1";
import Env, { ENV } from "./config/config.env";
import Services from "./services/service.singleton";
import { errorHandler } from "./middleware/error-handler";
import { requestLogger } from "./middleware/request-logger";
import { notFoundHandler } from "./middleware/not-found";

Env.parse_env();
export const services = new Services();
services.boot();

const app = express();
app.use(cors({ origin: ENV.SERVER_WEB_ORIGIN, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);
app.use("/api/v1", v1_router);
app.use(notFoundHandler);
app.use(errorHandler);

await services.polymarket.start();

const server = app.listen(ENV.SERVER_PORT, () => {
  console.log(`server up on :${ENV.SERVER_PORT}`);
});

const shutdown = async (signal: string) => {
  console.log(`${signal} received, shutting down`);
  await services.polymarket.stop();
  server.close(() => process.exit(0));
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
```

---

## How the moving pieces fit together

```
 consumer (any process)
        │
        │ PUBLISH polymarket:control {action, tokenId}
        ▼
   ControlListener ──► MarketSocket.subscribe(tokenId)
                              │
                              │ SubscriptionRegistry refcount
                              │   firstRef? → send SUBSCRIBE frame
                              ▼
                         Polymarket WSS ──► onMessage
                              │
                              ▼
                      PolymarketPublisher
                              │
                              │ redis.publish polymarket:market:book:{tokenId}
                              ▼
                          consumers SUBSCRIBE
```

The consumer never imports the mirror. The mirror never imports the consumer. The only contract between them is the Redis channel names in `config.polymarket.ts`.

---

## Verification (do this after you finish typing)

1. `bun run --hot apps/server/index.ts` — should print `market socket: open` (via status publish) and `[poly:control] subscribed to polymarket:control`.
2. Terminal A: `redis-cli -p 6380 PSUBSCRIBE 'polymarket:market:book:*'`
3. Terminal B: `redis-cli -p 6380 PUBLISH polymarket:control '{"action":"subscribe","tokenId":"<real-token-id>"}'`
4. Terminal A should start printing `book` messages within a few seconds.
5. Publish the same `subscribe` again from a third terminal — in the server logs, you should see `acquire ... firstRef=false`, confirming no duplicate `SUBSCRIBE` frame went out.
6. Kill your network briefly (or `redis-cli DEBUG SLEEP` won't help here — just unplug wifi). On reconnect, the server should re-send `SUBSCRIBE` with the full registry snapshot. Add a temporary `console.log` in `getSubscribeFrame` if you want to watch it.
7. Publish `unsubscribe` and confirm the refcount drops in logs.
8. If your `.env` has `SERVER_POLYMARKET_API_KEY` set, watch `polymarket:user:trade` and confirm the user socket survives past the first ping (Polymarket closes the socket immediately on bad auth — if it keeps dying, the auth shape is wrong).

---

## Caveats to remember

- **Unsubscribe:** Polymarket's WSS doesn't document an unsubscribe frame. v1 does nothing on `lastRef`; if bandwidth matters later, force-reconnect so `getSubscribeFrame()` re-sends the smaller set.
- **Consumer crashes leak refcounts.** Acceptable for v1. If it bites, add a TTL lease: consumers write `polymarket:lease:{consumerId}:{tokenId}` with expiry, mirror scans and releases on expiry.
- **Auth shape** for the user channel — verify field names against current Polymarket docs when you test.
- **ioredis subscriber is a separate connection** — don't reuse `services.redis` for `SUBSCRIBE` or the main client becomes unusable for normal commands. This is already handled in `ControlListener`.
