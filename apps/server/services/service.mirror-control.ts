import type Redis from "ioredis";
import { REDIS_CHANNELS, type ControlMessage } from "@solmarket/polymarket-contracts";

/**
 * Source-of-truth writer for which tokens the mirror should be following.
 *
 * Two-tier protocol:
 *   1. Durable: SADD/SREM `polymarket:intent:tokens` (the SET). Survives
 *      mirror restarts; mirror reads SMEMBERS on boot/reconnect to converge.
 *   2. Nudge: PUBLISH on the control channel for low-latency pickup.
 *
 * Order: SET write before PUBLISH, so a mirror waking up between the two
 * still observes the new intent on its own boot scan.
 */
export default class MirrorControlPublisher {
    private readonly pub: Redis;
    private readonly consumer_id = "curator";

    constructor(pub: Redis) {
        this.pub = pub;
    }

    public async subscribe(token_ids: string[]): Promise<void> {
        if (token_ids.length === 0) return;
        const pipeline = this.pub.multi();
        pipeline.sadd(REDIS_CHANNELS.intent_set, ...token_ids);
        for (const id of token_ids) {
            pipeline.publish(REDIS_CHANNELS.control, this.encode("subscribe", id));
        }
        await pipeline.exec();
    }

    public async unsubscribe(token_ids: string[]): Promise<void> {
        if (token_ids.length === 0) return;
        const pipeline = this.pub.multi();
        pipeline.srem(REDIS_CHANNELS.intent_set, ...token_ids);
        for (const id of token_ids) {
            pipeline.publish(REDIS_CHANNELS.control, this.encode("unsubscribe", id));
        }
        await pipeline.exec();
    }

    /** Reconcile the SET to exactly match `desired`. Returns added/removed counts. */
    public async reconcile(desired: string[]): Promise<{ added: string[]; removed: string[] }> {
        const current = await this.pub.smembers(REDIS_CHANNELS.intent_set);
        const desired_set = new Set(desired);
        const current_set = new Set(current);
        const added = desired.filter((id) => !current_set.has(id));
        const removed = current.filter((id) => !desired_set.has(id));
        if (added.length > 0) await this.subscribe(added);
        if (removed.length > 0) await this.unsubscribe(removed);
        return { added, removed };
    }

    public async intent_snapshot(): Promise<string[]> {
        return this.pub.smembers(REDIS_CHANNELS.intent_set);
    }

    private encode(action: ControlMessage["action"], token_id: string): string {
        const msg: ControlMessage = { action, token_id, consumer_id: this.consumer_id };
        return JSON.stringify(msg);
    }
}
