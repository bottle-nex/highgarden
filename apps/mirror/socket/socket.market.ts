import { SocketBase } from "./socket.base";
import SubscriptionRegistry from "../services/service.polymarket.registry";
import { POLY_WS } from "../config/config.polymarket";
import { ENV } from "../config/config.env";
import type { MarketEvent } from "@solmarket/polymarket-contracts";
import type PolymarketPublisher from "../services/service.polymarket.publisher";
import type TokenIndex from "../services/service.token-index";

export default class MarketSocket extends SocketBase {
    public readonly registry = new SubscriptionRegistry();

    constructor(publisher: PolymarketPublisher, token_index: TokenIndex) {
        super("market", publisher, token_index);
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
        console.log(
            `[poly:market] acquire market=${this.token_index.label(token_id)} (count=${count}, first_ref=${firstRef})`,
        );
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
        console.log(
            `[poly:market] release market=${this.token_index.label(token_id)} (count=${count}, last_ref=${lastRef})`,
        );
        // v1: Polymarket WSS has no unsubscribe frame. If bandwidth becomes an
        // issue, force-reconnect when last_ref is true — get_subscribe_frame()
        // will re-send the smaller set.
    }

    protected handle_message(msg: unknown): void {
        if (!is_market_event_envelope(msg)) return;
        const items = normalize_to_internal(msg);
        for (const ev of items) void this.publisher.publish_market(ev);
    }
}

function is_market_event_envelope(msg: unknown): msg is Record<string, unknown> {
    if (!msg || typeof msg !== "object") return false;
    const t = (msg as { event_type?: unknown }).event_type;
    return t === "book" || t === "price_change" || t === "tick_size_change";
}

interface RawPriceChangeEntry {
    asset_id?: unknown;
    price?: unknown;
    size?: unknown;
    side?: unknown;
}

function normalize_to_internal(raw: Record<string, unknown>): MarketEvent[] {
    const event_type = raw.event_type as MarketEvent["event_type"];

    if (event_type === "book" || event_type === "tick_size_change") {
        if (typeof raw.asset_id !== "string") return [];
        return [raw as unknown as MarketEvent];
    }

    // event_type === "price_change"
    const list = (raw.price_changes ?? raw.changes) as RawPriceChangeEntry[] | undefined;
    if (!Array.isArray(list) || list.length === 0) return [];

    const groups = new Map<string, RawPriceChangeEntry[]>();
    for (const entry of list) {
        if (typeof entry?.asset_id !== "string") {
            console.warn(
                `[mirror:normalize] dropping price_change entry without asset_id — keys=${Object.keys(entry ?? {}).join(",")}`,
            );
            continue;
        }
        const arr = groups.get(entry.asset_id) ?? [];
        arr.push(entry);
        groups.set(entry.asset_id, arr);
    }

    const market = typeof raw.market === "string" ? raw.market : "";
    const timestamp = typeof raw.timestamp === "string" ? raw.timestamp : "";

    const out: MarketEvent[] = [];
    for (const [asset_id, entries] of groups) {
        out.push({
            event_type: "price_change",
            asset_id,
            market,
            changes: entries.map((e) => ({
                price: String(e.price ?? ""),
                size: String(e.size ?? ""),
                side: e.side === "SELL" ? "SELL" : "BUY",
            })),
            timestamp,
        });
    }
    return out;
}
