import Redis from "ioredis";
import { REDIS_CHANNELS, type ControlMessage } from "@solmarket/polymarket-contracts";

export default class RedisSubscriber {
    private sub: Redis;
    private pub: Redis;
    private refs = new Map<string, number>();
    private channel_to_token = new Map<string, string>();
    // eslint-disable-next-line no-unused-vars
    private on_message: (token_id: string, data: string) => void;
    /** Optional marketId/name resolver injected after construction. */
    public label_for: ((token_id: string) => string) | null = null;

    // eslint-disable-next-line no-unused-vars
    constructor(redis_url: string, on_message: (token_id: string, data: string) => void) {
        this.on_message = on_message;
        this.sub = new Redis(redis_url);
        this.pub = new Redis(redis_url);

        this.sub.on("message", (channel: string, data: string) => {
            const token_id = this.channel_to_token.get(channel);
            if (!token_id) return;
            const label = this.label_for?.(token_id) ?? short(token_id);
            const kind = channel.includes(":book:")
                ? "book"
                : channel.includes(":price:")
                  ? "price"
                  : "tick";
            console.log(
                `[4.redis→ws-srv] forward market=${label} kind=${kind} bytes=${data.length}`,
            );
            this.on_message(token_id, data);
        });
    }

    public subscribe(token_id: string): void {
        const prev = this.refs.get(token_id) ?? 0;
        this.refs.set(token_id, prev + 1);

        if (prev === 0) {
            const channels = this.channels_for(token_id);
            for (const ch of channels) {
                this.channel_to_token.set(ch, token_id);
            }
            this.sub.subscribe(...channels);
            this.publish_control({ action: "subscribe", token_id });
            const label = this.label_for?.(token_id) ?? short(token_id);
            console.log(`[ws:subscriber] subscribed market=${label} (3 channels)`);
        }
    }

    public snapshot_refs(): Map<string, number> {
        return new Map(this.refs);
    }

    public unsubscribe(token_id: string): void {
        const prev = this.refs.get(token_id) ?? 0;
        if (prev <= 0) return;

        const next = prev - 1;
        if (next === 0) {
            this.refs.delete(token_id);
            const channels = this.channels_for(token_id);
            for (const ch of channels) {
                this.channel_to_token.delete(ch);
            }
            this.sub.unsubscribe(...channels);
            this.publish_control({ action: "unsubscribe", token_id });
            console.log(`[ws:subscriber] unsubscribed from ${token_id}`);
        } else {
            this.refs.set(token_id, next);
        }
    }

    public async shutdown(): Promise<void> {
        await this.sub.quit();
        await this.pub.quit();
    }

    private channels_for(token_id: string): [string, string, string] {
        return [
            REDIS_CHANNELS.market_book(token_id),
            REDIS_CHANNELS.market_price(token_id),
            REDIS_CHANNELS.market_tick(token_id),
        ];
    }

    private publish_control(msg: ControlMessage): void {
        this.pub.publish(REDIS_CHANNELS.control, JSON.stringify(msg));
    }
}

function short(token_id: string): string {
    if (token_id.length <= 12) return token_id;
    return `${token_id.slice(0, 8)}…${token_id.slice(-4)}`;
}
