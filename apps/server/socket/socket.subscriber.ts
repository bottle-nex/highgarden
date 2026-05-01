import Redis from "ioredis";
import { REDIS_CHANNELS } from "@solmarket/polymarket-contracts";
import type MirrorControlPublisher from "../services/service.mirror-control";
import type BookCache from "./../services/service.book-cache";
import chalk from "chalk";

export default class RedisSubscriber {
    private sub: Redis;
    private refs = new Map<string, number>();
    private channel_to_token = new Map<string, string>();
    // eslint-disable-next-line no-unused-vars
    private on_message: (token_id: string, data: string) => void;
    private mirror_control: MirrorControlPublisher;
    private book_cache: BookCache;

    constructor(
        redis_url: string,
        // eslint-disable-next-line no-unused-vars
        on_message: (token_id: string, data: string) => void,
        mirror_control: MirrorControlPublisher,
        book_cache: BookCache,
    ) {
        this.on_message = on_message;
        this.mirror_control = mirror_control;
        this.book_cache = book_cache;
        this.sub = new Redis(redis_url);

        this.sub.on("message", (channel: string, data: string) => {
            const token_id = this.channel_to_token.get(channel);
            if (!token_id) return;
            this.on_message(token_id, data);
        });
    }

    public subscribe(token_id: string): void {
        const prev = this.refs.get(token_id) ?? 0;
        this.refs.set(token_id, prev + 1);
        if (prev > 0) return;

        const channels = this.channels_for(token_id);
        for (const ch of channels) {
            this.channel_to_token.set(ch, token_id);
        }
        this.sub.subscribe(...channels).catch((err) => {
            console.error(chalk.red("[ws:server] redis subscribe failed"), token_id, err);
        });
        // First user interest in this token — persist intent (SADD + nudge)
        // and start caching the book so REST snapshot calls see live data.
        Promise.all([
            this.mirror_control.subscribe([token_id]),
            this.book_cache.track([token_id]),
        ]).catch((err) => {
            console.error(chalk.red("[ws:server] mirror arm failed"), token_id, err);
        });
    }

    public snapshot_refs(): Map<string, number> {
        return new Map(this.refs);
    }

    public unsubscribe(token_id: string): void {
        const prev = this.refs.get(token_id) ?? 0;
        console.log(chalk.yellow("[ws:sub] unsubscribe"), chalk.gray(`prev_refs=${prev}`), token_id);
        if (prev <= 0) return;

        const next = prev - 1;
        console.log(chalk.yellow("[ws:sub] refs after "), chalk.gray(`next_refs=${next}`), token_id);
        if (next > 0) {
            this.refs.set(token_id, next);
            return;
        }

        this.refs.delete(token_id);
        const channels = this.channels_for(token_id);
        for (const ch of channels) {
            this.channel_to_token.delete(ch);
        }
        this.sub.unsubscribe(...channels).catch((err) => {
            console.error(chalk.red("[ws:server] redis unsubscribe failed"), token_id, err);
        });
        // Last user interest gone — clear durable intent and free the cache so
        // the mirror stops pulling this token from Polymarket.
        Promise.all([
            this.mirror_control.unsubscribe([token_id]),
            this.book_cache.untrack([token_id]),
        ]).catch((err) => {
            console.error(chalk.red("[ws:server] mirror disarm failed"), token_id, err);
        });
    }

    public async shutdown(): Promise<void> {
        await this.sub.quit();
    }

    private channels_for(token_id: string): [string, string, string] {
        return [
            REDIS_CHANNELS.market_book(token_id),
            REDIS_CHANNELS.market_price(token_id),
            REDIS_CHANNELS.market_tick(token_id),
        ];
    }
}
