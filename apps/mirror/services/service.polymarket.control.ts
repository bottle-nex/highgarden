import Redis from "ioredis";
import { ENV } from "../config/config.env";
import { REDIS_CHANNELS, type ControlMessage } from "@solmarket/polymarket-contracts";
import type MarketSocket from "../socket/socket.market";

export default class PolymarketControlListener {
    private sub: Redis | null = null;
    private readonly market: MarketSocket

    constructor(market: MarketSocket) {
        this.market = market;
    }

    public async start(): Promise<void> {
        // ioredis requires a dedicated client for SUBSCRIBE mode — don't reuse
        // services.redis or the main client becomes unusable for normal commands.
        this.sub = new Redis(ENV.SERVER_REDIS_URL);
        await this.sub.subscribe(REDIS_CHANNELS.control);
        this.sub.on("message", (_channel, raw) => this.handle(raw));
        console.log(`[poly:control] subscribed to ${REDIS_CHANNELS.control}`);
    }

    public async stop(): Promise<void> {
        await this.sub?.quit();
        this.sub = null;
    }

    private handle(raw: string): void {
        const parsed = this.parse(raw);
        if (!parsed) {
            console.warn("[poly:control] bad message", raw);
            return;
        }
        if (parsed.action === "subscribe") {
            this.market.subscribe(parsed.token_id);
        } else {
            this.market.unsubscribe(parsed.token_id);
        }
    }

    private parse(raw: string): ControlMessage | null {
        try {
            const obj = JSON.parse(raw) as Partial<ControlMessage>;
            if (typeof obj?.token_id !== "string") return null;
            if (obj.action !== "subscribe" && obj.action !== "unsubscribe") {
                return null;
            }
            return {
                action: obj.action,
                token_id: obj.token_id,
                consumer_id: obj.consumer_id,
            };
        } catch {
            return null;
        }
    }
}
