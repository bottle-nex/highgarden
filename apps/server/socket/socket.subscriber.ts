import Redis from "ioredis";
import { REDIS_CHANNELS, type ControlMessage } from "@solmarket/polymarket-contracts";

export default class RedisSubscriber {
    private sub: Redis;
    private pub: Redis;
    private refs = new Map<string, number>();
    private channel_to_token = new Map<string, string>();
    // eslint-disable-next-line no-unused-vars
    private on_message: (token_id: string, data: string) => void;

    // eslint-disable-next-line no-unused-vars
    constructor(redis_url: string, on_message: (token_id: string, data: string) => void) {
        this.on_message = on_message;
        this.sub = new Redis(redis_url);
        this.pub = new Redis(redis_url);

        this.sub.on("message", (channel: string, data: string) => {
            const token_id = this.channel_to_token.get(channel);
            if (token_id) {
                this.on_message(token_id, data);
            }
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
            console.log(`[ws:subscriber] subscribed to ${token_id} (3 channels)`);
        }
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
