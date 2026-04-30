import type Redis from "ioredis";
import { REDIS_CHANNELS, type MarketEvent, type UserEvent } from "@solmarket/polymarket-contracts";
import type TokenIndex from "./service.token-index";

export default class PolymarketPublisher {
    private redis!: Redis;
    private token_index: TokenIndex;
    constructor(redis: Redis, token_index: TokenIndex) {
        this.redis = redis;
        this.token_index = token_index;
    }

    public async publish_market(event: MarketEvent): Promise<void> {
        const payload = JSON.stringify(event);
        const label = this.token_index.label(event.asset_id);
        switch (event.event_type) {
            case "book": {
                const subs = await this.redis.publish(
                    REDIS_CHANNELS.market_book(event.asset_id),
                    payload,
                );
                console.log(
                    `[2.mirror→redis] book market=${label} bids=${event.bids.length} asks=${event.asks.length} subs=${subs}`,
                );
                return;
            }
            case "price_change": {
                const subs = await this.redis.publish(
                    REDIS_CHANNELS.market_price(event.asset_id),
                    payload,
                );
                console.log(
                    `[2.mirror→redis] price_change market=${label} changes=${event.changes.length} subs=${subs}`,
                );
                return;
            }
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
