import Redis from "ioredis";
import { REDIS_CHANNELS } from "@solmarket/types";
import { make_redis_options } from "./redis";
import { logger_for } from "./log/log";

/**
 * Wire-format mirror of the `MarketLifecycleEvent` union the server
 * publishes — kept here to avoid a cross-app import. If the union ever
 * grows, both sides need updating.
 */
type LifecycleEvent = {
    kind: "resolved";
    marketId: string;
    winningOutcome: "YES" | "NO";
    resolvedAt: string;
};

/**
 * Dedicated pub-only Redis client used by the hedger to push lifecycle
 * nudges (market resolutions today) onto the shared
 * `solmarket:market:lifecycle` channel. Separate from the BullMQ
 * connections so an issue here can't take down the hedge queue and
 * vice versa.
 *
 * Publishing is best-effort: failures are logged but never thrown.
 * The DB row is already updated by the caller, so a missed publish
 * just means a user has to refresh to see the resolution — annoying
 * but not destructive.
 */
export default class HedgerRedisPublisher {
    private readonly log = logger_for("hedger-pub");
    private readonly pub: Redis;

    constructor() {
        this.pub = new Redis(make_redis_options());
    }

    public async publish_resolved(
        market_id: string,
        winning_outcome: "YES" | "NO",
        resolved_at: Date,
    ): Promise<void> {
        const event: LifecycleEvent = {
            kind: "resolved",
            marketId: market_id,
            winningOutcome: winning_outcome,
            resolvedAt: resolved_at.toISOString(),
        };
        try {
            await this.pub.publish(REDIS_CHANNELS.market_lifecycle, JSON.stringify(event));
        } catch (err) {
            this.log.error({ err, marketId: market_id }, "lifecycle publish failed");
        }
    }

    public async shutdown(): Promise<void> {
        try {
            await this.pub.quit();
        } catch (err) {
            this.log.warn({ err }, "publisher quit failed");
        }
    }
}
