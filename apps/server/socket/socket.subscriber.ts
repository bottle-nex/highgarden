import Redis from "ioredis";
import { REDIS_CHANNELS } from "@solmarket/polymarket-contracts";
import type MirrorControlPublisher from "../services/service.mirror-control";
import type BookCache from "./../services/service.book-cache";
import type { MarketLifecycleEvent } from "../services/service.market-lifecycle";

export default class RedisSubscriber {
    private sub: Redis;
    private refs = new Map<string, number>();
    private channel_to_token = new Map<string, string>();
    // HTTP-driven keepalive. Lives separately from `refs` so the WS ref counter
    // never sees a phantom increment from REST callers. Tokens here are kept
    // tracked while their timestamp is within `http_ttl_ms`; the sweeper drops
    // them once stale and ends tracking iff there is also no WS interest.
    private http_touch = new Map<string, number>();
    private readonly http_ttl_ms = 60_000;
    private readonly sweep_interval_ms = 15_000;
    private sweeper: ReturnType<typeof setInterval> | null = null;
    // eslint-disable-next-line no-unused-vars
    private on_message: (token_id: string, data: string) => void;
    // eslint-disable-next-line no-unused-vars
    private on_lifecycle: (event: MarketLifecycleEvent) => void;
    private mirror_control: MirrorControlPublisher;
    private book_cache: BookCache;

    constructor(
        redis_url: string,
        // eslint-disable-next-line no-unused-vars
        on_message: (token_id: string, data: string) => void,
        mirror_control: MirrorControlPublisher,
        book_cache: BookCache,
        // eslint-disable-next-line no-unused-vars
        on_lifecycle: (event: MarketLifecycleEvent) => void,
    ) {
        this.on_message = on_message;
        this.on_lifecycle = on_lifecycle;
        this.mirror_control = mirror_control;
        this.book_cache = book_cache;
        this.sub = new Redis(redis_url);

        this.sub.on("message", (channel: string, data: string) => {
            if (channel === REDIS_CHANNELS.market_lifecycle) {
                this.dispatch_lifecycle(data);
                return;
            }
            const token_id = this.channel_to_token.get(channel);
            if (!token_id) return;
            this.on_message(token_id, data);
        });

        // Permanent subscription to the lifecycle channel — it's a single
        // low-rate stream of solmarket-internal events (resolutions today,
        // status flips later) and doesn't need the per-token ref-counted
        // tracking the book/price channels use.
        this.sub.subscribe(REDIS_CHANNELS.market_lifecycle).catch((err) => {
            console.error("[ws:server] lifecycle subscribe failed", err);
        });

        this.sweeper = setInterval(() => this.sweep_http(), this.sweep_interval_ms);
    }

    private dispatch_lifecycle(data: string): void {
        let parsed: unknown;
        try {
            parsed = JSON.parse(data);
        } catch {
            console.warn("[ws:server] lifecycle payload not JSON", data);
            return;
        }
        // Only `resolved` exists today, but route by `kind` so adding more
        // event types later doesn't need a refactor — unknown kinds are
        // silently dropped, which is the right behaviour during a rolling
        // deploy where a newer publisher may emit kinds an older server
        // doesn't understand yet.
        if (!parsed || typeof parsed !== "object" || !("kind" in parsed)) return;
        const event = parsed as MarketLifecycleEvent;
        if (event.kind === "resolved") {
            this.on_lifecycle(event);
        }
    }

    public subscribe(token_id: string): void {
        const prev_ws = this.refs.get(token_id) ?? 0;
        this.refs.set(token_id, prev_ws + 1);
        if (prev_ws > 0) return;
        if (this.http_touch.has(token_id)) return;
        this.begin_tracking(token_id);
    }

    public touch_http(token_id: string): void {
        const had_any_interest =
            (this.refs.get(token_id) ?? 0) > 0 || this.http_touch.has(token_id);
        this.http_touch.set(token_id, Date.now());
        if (!had_any_interest) this.begin_tracking(token_id);
    }

    public snapshot_refs(): Map<string, number> {
        return new Map(this.refs);
    }

    public unsubscribe(token_id: string): void {
        const prev = this.refs.get(token_id) ?? 0;
        if (prev <= 0) return;

        const next = prev - 1;
        if (next > 0) {
            this.refs.set(token_id, next);
            return;
        }

        this.refs.delete(token_id);
        if (this.http_touch.has(token_id)) return;
        this.end_tracking(token_id);
    }

    public async shutdown(): Promise<void> {
        if (this.sweeper) {
            clearInterval(this.sweeper);
            this.sweeper = null;
        }
        await this.sub.quit();
    }

    private begin_tracking(token_id: string): void {
        const channels = this.channels_for(token_id);
        for (const ch of channels) {
            this.channel_to_token.set(ch, token_id);
        }
        this.sub.subscribe(...channels).catch((err) => {
            console.error("[ws:server] redis subscribe failed", token_id, err);
        });
        Promise.all([
            this.mirror_control.subscribe([token_id]),
            this.book_cache.track([token_id]),
        ]).catch((err) => {
            console.error("[ws:server] mirror arm failed", token_id, err);
        });
    }

    private end_tracking(token_id: string): void {
        const channels = this.channels_for(token_id);
        for (const ch of channels) {
            this.channel_to_token.delete(ch);
        }
        this.sub.unsubscribe(...channels).catch((err) => {
            console.error("[ws:server] redis unsubscribe failed", token_id, err);
        });
        Promise.all([
            this.mirror_control.unsubscribe([token_id]),
            this.book_cache.untrack([token_id]),
        ]).catch((err) => {
            console.error("[ws:server] mirror disarm failed", token_id, err);
        });
    }

    private sweep_http(): void {
        const now = Date.now();
        for (const [token_id, last] of this.http_touch.entries()) {
            if (now - last <= this.http_ttl_ms) continue;
            this.http_touch.delete(token_id);
            if ((this.refs.get(token_id) ?? 0) === 0) this.end_tracking(token_id);
        }
    }

    private channels_for(token_id: string): [string, string, string] {
        return [
            REDIS_CHANNELS.market_book(token_id),
            REDIS_CHANNELS.market_price(token_id),
            REDIS_CHANNELS.market_tick(token_id),
        ];
    }
}
