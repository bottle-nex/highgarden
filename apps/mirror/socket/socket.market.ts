import { SocketBase } from "./socket.base";
import SubscriptionRegistry from "../services/service.polymarket.registry";
import { POLY_WS } from "../config/config.polymarket";
import { ENV } from "../config/config.env";
import type { MarketEvent } from "@solmarket/polymarket-contracts";
import type PolymarketPublisher from "../services/service.polymarket.publisher";
import type TokenIndex from "../services/service.token-index";

export default class MarketSocket extends SocketBase {
    public readonly registry = new SubscriptionRegistry();
    // Brief debounce so a market switch (UNSUB old → SUB new arriving back-to-
    // back) doesn't tear down and rebuild the Polymarket WSS for nothing.
    private idle_close_timer: ReturnType<typeof setTimeout> | null = null;
    private readonly idle_close_grace_ms = 3_000;
    // Debounce timer for the "refresh subscriptions via reconnect" path —
    // see `schedule_refresh_reconnect` for why this exists.
    private refresh_timer: ReturnType<typeof setTimeout> | null = null;
    private readonly refresh_debounce_ms = 250;

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
        if (this.idle_close_timer) {
            clearTimeout(this.idle_close_timer);
            this.idle_close_timer = null;
            console.log("[poly:market] close timer cancelled — new subscriber arrived", token_id);
        }

        const { firstRef } = this.registry.acquire(token_id);
        console.log(
            "[poly:market] subscribe",
            token_id,
            `firstRef=${firstRef} state=${this.state} registry=${this.registry.size()}`,
        );
        if (!firstRef) return;

        // Polymarket drops idle sockets, so we only open the connection on the
        // first subscription. Later acquires ride on the existing socket.
        if (this.state === "open") {
            // Polymarket's CLOB WSS treats the *initial* subscribe frame at
            // connect time as authoritative — additional subscribe frames
            // sent on the same connection are silently dropped for some
            // markets, leaving the new token never streaming. Manually
            // restarting the mirror is what fixes it, because the fresh
            // connect emits get_subscribe_frame() with the full registry.
            //
            // So we replicate that: on every new token while open, schedule
            // a reconnect to re-send the full registry. Debounced so a
            // YES+NO pair on one market navigation collapses into a single
            // round-trip instead of two.
            this.schedule_refresh_reconnect();
        } else if (
            this.state === "idle" ||
            this.state === "closed" ||
            this.state === "reconnecting"
        ) {
            // "reconnecting" means a previous connect failed and a timer is pending —
            // clear it and reconnect immediately now that there's a real subscriber.
            console.log("[poly:market] → connecting", token_id, `state=${this.state}`);
            void this.connect();
        } else {
            // state="connecting" — token is in registry and will be included in the
            // subscribe frame when on_open fires. No connect() needed.
            console.log(
                "[poly:market] queued in registry, waiting for open",
                token_id,
                `state=${this.state} registry=${this.registry.size()}`,
            );
        }
    }

    /**
     * Cycle the Polymarket WSS connection so the full registry is re-sent
     * as one subscribe frame on the next `on_open`. Debounced — back-to-
     * back subscribes (typically yes + no tokens of the same market) get
     * a single reconnect rather than two. Skip if a refresh is already
     * scheduled or if the socket isn't currently open.
     */
    private schedule_refresh_reconnect(): void {
        if (this.refresh_timer) return;
        if (this.state !== "open") return;
        this.refresh_timer = setTimeout(() => {
            this.refresh_timer = null;
            if (this.state !== "open") return;
            console.log(
                "[poly:market] cycling WSS to refresh subscriptions",
                `registry=${this.registry.size()}`,
            );
            // Closing triggers `on_close` → `schedule_reconnect` → `connect`
            // → `on_open` → subscribe frame with the full registry. The
            // 1000 code is a clean closure so reconnect_delay resets to
            // POLY_WS.reconnect_initial_ms (usually ~250ms), keeping the
            // gap tight.
            try {
                this.ws?.close(1000, "refresh subscriptions");
            } catch (err) {
                console.warn("[poly:market] refresh close threw", err);
            }
        }, this.refresh_debounce_ms);
    }

    public unsubscribe(token_id: string): void {
        const { lastRef, count } = this.registry.release(token_id);
        console.log(
            "[poly:market] unsubscribe",
            token_id,
            `refs=${count} registry=${this.registry.size()}`,
        );
        const active = this.state === "open" || this.state === "connecting";
        if (lastRef && this.registry.size() === 0 && active) {
            if (this.idle_close_timer) clearTimeout(this.idle_close_timer);
            console.log("[poly:market] no subscribers — starting 3s close timer");
            this.idle_close_timer = setTimeout(() => {
                this.idle_close_timer = null;
                if (
                    this.registry.size() === 0 &&
                    (this.state === "open" || this.state === "connecting")
                ) {
                    console.log("[poly:market] closing Polymarket WSS");
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
