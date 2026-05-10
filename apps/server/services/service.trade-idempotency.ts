import type Redis from "ioredis";
import { ENV } from "../config/config.env";

/**
 * Cached result of a previous successful or terminally-failed trade
 * keyed by client-supplied requestId. Re-issued verbatim on retry.
 */
export interface CachedTradeResult {
    /** Final HTTP status to return. */
    status: number;
    /** Response body to echo back. */
    body: unknown;
}

export type ClaimOutcome =
    | { kind: "claimed" }
    | { kind: "in_flight" }
    | { kind: "completed"; result: CachedTradeResult };

const PENDING_MARKER = "__pending__";

/**
 * Redis-backed idempotency layer for the hedge-first trade endpoint. The
 * client supplies a UUID `requestId`; this service prevents the same id
 * from being executed twice and serves a cached result for retries.
 *
 * Lifecycle:
 *   1. {@link claim} — atomic SET NX EX with a "__pending__" marker.
 *      • If the key didn't exist → returns "claimed", caller proceeds.
 *      • If the key existed with the marker → returns "in_flight" (caller
 *        should poll or return 409).
 *      • If the key existed with a JSON result → returns "completed"
 *        with the cached body.
 *   2. {@link complete} — overwrites the pending marker with the final
 *      result so future retries get a cache hit.
 *   3. {@link release} — deletes the key (used when a request fails before
 *      we've reached a terminal state, so the user can retry cleanly).
 *
 * TTL is `SERVER_TRADE_IDEMPOTENCY_TTL_SEC` — long enough for the user
 * agent to retry once or twice on flaky networks, short enough that
 * eventually the same requestId can be reused (e.g. user clicks Buy
 * again later).
 */
export default class TradeIdempotencyService {
    private readonly redis: Redis;

    constructor(redis: Redis) {
        this.redis = redis;
    }

    public async claim(request_id: string): Promise<ClaimOutcome> {
        const key = this.key_for(request_id);
        const ttl = ENV.SERVER_TRADE_IDEMPOTENCY_TTL_SEC;
        const set_result = await this.redis.set(key, PENDING_MARKER, "EX", ttl, "NX");
        if (set_result === "OK") return { kind: "claimed" };
        return this.read_existing(key);
    }

    public async complete(request_id: string, result: CachedTradeResult): Promise<void> {
        const key = this.key_for(request_id);
        const ttl = ENV.SERVER_TRADE_IDEMPOTENCY_TTL_SEC;
        await this.redis.set(key, JSON.stringify(result), "EX", ttl);
    }

    public async release(request_id: string): Promise<void> {
        await this.redis.del(this.key_for(request_id));
    }

    private async read_existing(key: string): Promise<ClaimOutcome> {
        const raw = await this.redis.get(key);
        if (raw === null) {
            // Key disappeared between SET NX and GET (TTL expired). Treat as
            // a fresh claim attempt — recursive retry once.
            const retry = await this.redis.set(
                key,
                PENDING_MARKER,
                "EX",
                ENV.SERVER_TRADE_IDEMPOTENCY_TTL_SEC,
                "NX",
            );
            return retry === "OK" ? { kind: "claimed" } : { kind: "in_flight" };
        }
        if (raw === PENDING_MARKER) return { kind: "in_flight" };
        return this.parse_cached(raw);
    }

    private parse_cached(raw: string): ClaimOutcome {
        try {
            const parsed = JSON.parse(raw) as CachedTradeResult;
            return { kind: "completed", result: parsed };
        } catch {
            // Corrupt cache entry — treat as in-flight to be safe; will
            // expire via TTL.
            return { kind: "in_flight" };
        }
    }

    private key_for(request_id: string): string {
        return `trade:request:${request_id}`;
    }
}
