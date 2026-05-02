import type Redis from "ioredis";
import { REDIS_CHANNELS, type MarketEvent, type UserEvent } from "@solmarket/polymarket-contracts";
import chalk from "chalk";

export default class PolymarketPublisher {
    private redis!: Redis;
    constructor(redis: Redis) {
        this.redis = redis;
    }

    public async publish_market(event: MarketEvent): Promise<void> {
        const payload = JSON.stringify(event);
        switch (event.event_type) {
            case "book": {
                console.log(chalk.blue("book received for: "), event.asset_id);
                await this.redis.publish(REDIS_CHANNELS.market_book(event.asset_id), payload);
                return;
            }
            case "price_change":
                await this.redis.publish(REDIS_CHANNELS.market_price(event.asset_id), payload);
                return;
            case "tick_size_change":
                await this.redis.publish(REDIS_CHANNELS.market_tick(event.asset_id), payload);
                return;
        }
    }

    public async publish_user(event: UserEvent): Promise<void> {
        const payload = JSON.stringify(event);
        if (event.event_type === "trade") {
            await this.redis.publish(REDIS_CHANNELS.user_trade, payload);
        } else if (event.event_type === "order") {
            await this.redis.publish(REDIS_CHANNELS.user_order, payload);
        }
    }

    public async publish_status(socket: "market" | "user", state: string): Promise<void> {
        await this.redis.publish(
            REDIS_CHANNELS.status,
            JSON.stringify({ socket, state, at: Date.now() }),
        );
    }
}
