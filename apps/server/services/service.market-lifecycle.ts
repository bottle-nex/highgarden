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

    /** Sugar for the "outcome known, on-chain still pending" broadcast.
     *  Use right after the DB write so the trade panel can show the
     *  winner without waiting for resolve_market to land. */
    public async publish_outcome_pending(
        marketId: string,
        winningOutcome: MarketResolvedPayload["winningOutcome"],
        resolvedAt: string,
    ): Promise<void> {
        await this.publish_resolved({ marketId, winningOutcome, resolvedAt, claimable: false });
    }

    /** Sugar for the "on-chain confirmed, claim is live" follow-up. */
    public async publish_claimable(
        marketId: string,
        winningOutcome: MarketResolvedPayload["winningOutcome"],
        resolvedAt: string,
    ): Promise<void> {
        await this.publish_resolved({ marketId, winningOutcome, resolvedAt, claimable: true });
    }
}

/** Wire-format union of every event we publish on the lifecycle channel.
 *  Discriminated by `kind` so the WS subscriber can decode without
 *  guessing. New event types extend this union — keep them small. */
export type MarketLifecycleEvent = {
    kind: "resolved";
} & MarketResolvedPayload;
