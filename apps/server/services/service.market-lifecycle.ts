import type Redis from "ioredis";
import { REDIS_CHANNELS } from "@solmarket/polymarket-contracts";
import type { MarketResolvedPayload } from "@solmarket/types";

/**
 * Pushes solmarket-internal market-lifecycle events onto the shared
 * `solmarket:market:lifecycle` redis channel. The server's WebSocket
 * layer subscribes to that channel and fans the payload out to every
 * connected client as a typed `MARKET_RESOLVED` message — that's what
 * flips the event page from "Buy / Sell" to "Claim payout" without a
 * page refresh.
 *
 * Single static channel: lifecycle events are rare (one per market
 * resolution) so multiplexing them by marketId would just add wire
 * overhead. Clients filter by marketId locally.
 */
export default class MarketLifecyclePublisher {
    private readonly pub: Redis;

    constructor(pub: Redis) {
        this.pub = pub;
    }

    public async publish_resolved(payload: MarketResolvedPayload): Promise<void> {
        const wire = { kind: "resolved" as const, ...payload };
        await this.pub.publish(REDIS_CHANNELS.market_lifecycle, JSON.stringify(wire));
    }
}

/** Wire-format union of every event we publish on the lifecycle channel.
 *  Discriminated by `kind` so the WS subscriber can decode without
 *  guessing. New event types extend this union — keep them small. */
export type MarketLifecycleEvent = {
    kind: "resolved";
} & MarketResolvedPayload;
