import { SocketBase } from "./socket.base";
import SubscriptionRegistry from "../services/service.polymarket.registry";
import { POLY_WS } from "../config/config.polymarket";
import { ENV } from "../config/config.env";
import type { MarketEvent } from "@solmarket/polymarket-contracts";
import type PolymarketPublisher from "../services/service.polymarket.publisher";
import type TokenIndex from "../services/service.token-index";
import chalk from "chalk";

export default class MarketSocket extends SocketBase {
    public readonly registry = new SubscriptionRegistry();
    // Brief debounce so a market switch (UNSUB old → SUB new arriving back-to-
    // back) doesn't tear down and rebuild the Polymarket WSS for nothing.
    private idle_close_timer: ReturnType<typeof setTimeout> | null = null;
    private readonly idle_close_grace_ms = 750;

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
        // A new subscriber arrived during the close grace window — keep the
        // socket alive instead of bouncing it.
        if (this.idle_close_timer) {
            clearTimeout(this.idle_close_timer);
            this.idle_close_timer = null;
        }

        const { firstRef } = this.registry.acquire(token_id);
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
        const { lastRef } = this.registry.release(token_id);
        // Polymarket's market WSS has no unsubscribe frame. To actually stop
        // receiving data when no users are watching anything, drop the socket
        // entirely once the registry is empty. Next subscribe will reconnect.
        if (lastRef && this.registry.size() === 0 && this.state === "open") {
            if (this.idle_close_timer) clearTimeout(this.idle_close_timer);
            this.idle_close_timer = setTimeout(() => {
                this.idle_close_timer = null;
                if (this.registry.size() === 0 && this.state === "open") {
                    console.log(
                        chalk.gray("[poly:market] no subscribers — closing Polymarket WSS"),
                    );
                    void this.stop();
                }
            }, this.idle_close_grace_ms);
        }
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
