import type Redis from "ioredis";
import { REDIS_CHANNELS, type ControlMessage } from "@solmarket/polymarket-contracts";

/**
 * Thin publisher to the mirror's control channel. Approval/rejection of a
 * curated market emits a single subscribe/unsubscribe — the mirror itself
 * ref-counts internally, so re-publishing the same subscribe is safe.
 *
 * We deliberately do not ref-count here because curator subscriptions are
 * persistent (tied to Listing.status), not per-request.
 */
export default class MirrorControlPublisher {
    private readonly pub: Redis;
    private readonly consumer_id = "curator";

    constructor(pub: Redis) {
        this.pub = pub;
    }

    public async subscribe(token_ids: string[]): Promise<void> {
        await Promise.all(token_ids.map((id) => this.publish("subscribe", id)));
    }

    public async unsubscribe(token_ids: string[]): Promise<void> {
        await Promise.all(token_ids.map((id) => this.publish("unsubscribe", id)));
    }

    private publish(action: ControlMessage["action"], token_id: string): Promise<number> {
        const msg: ControlMessage = { action, token_id, consumer_id: this.consumer_id };
        return this.pub.publish(REDIS_CHANNELS.control, JSON.stringify(msg));
    }
}
