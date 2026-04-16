import { SocketBase } from "./socket.base";
import SubscriptionRegistry from "../services/service.polymarket.registry";
import { POLY_WS } from "../config/config.polymarket";
import { ENV } from "../config/config.env";
import type { MarketEvent } from "@solmarket/polymarket-contracts";
import type PolymarketPublisher from "../services/service.polymarket.publisher";

export default class MarketSocket extends SocketBase {
    public readonly registry = new SubscriptionRegistry();

    constructor(publisher: PolymarketPublisher) {
        super("market", publisher);
    }

    protected get_url(): string {
        return ENV.SERVER_POLYMARKET_WS_URL + POLY_WS.market_path;
    }

    protected get_subscribe_frame(): object | null {
        const assets_ids = this.registry.snapshot();
        if (assets_ids.length === 0) return null;
        return { type: "MARKET", assets_ids };
    }

    public subscribe(token_id: string): void {
        const { firstRef, count } = this.registry.acquire(token_id);
        console.log(`[poly:market] acquire ${token_id} (count=${count}, first_ref=${firstRef})`);
        if (!firstRef) return;

        // Polymarket drops idle sockets, so we only open the connection on the
        // first subscription. Later acquires ride on the existing socket.
        if (this.state === "open") {
            this.send({ type: "MARKET", assets_ids: [token_id] });
        } else if (this.state === "idle" || this.state === "closed") {
            void this.connect();
        }
    }

    public unsubscribe(token_id: string): void {
        const { lastRef, count } = this.registry.release(token_id);
        console.log(`[poly:market] release ${token_id} (count=${count}, last_ref=${lastRef})`);
        // v1: Polymarket WSS has no unsubscribe frame. If bandwidth becomes an
        // issue, force-reconnect when last_ref is true — get_subscribe_frame()
        // will re-send the smaller set.
    }

    protected handle_message(msg: unknown): void {
        if (!is_market_event(msg)) return;
        void this.publisher.publish_market(msg);
    }
}

function is_market_event(msg: unknown): msg is MarketEvent {
    if (!msg || typeof msg !== "object") return false;
    const t = (msg as { event_type?: unknown }).event_type;
    return t === "book" || t === "price_change" || t === "tick_size_change";
}
