import { SocketBase } from "./socket.base";
import { POLY_WS } from "../config/config.polymarket";
import { ENV } from "../config/config.env";
import { build_polymarket_auth } from "../services/service.polymarket.auth";
import type { UserEvent } from "@solmarket/polymarket-contracts";
import type PolymarketPublisher from "../services/service.polymarket.publisher";

export type UserMarketsProvider = () => Promise<string[]>;

export default class UserSocket extends SocketBase {
    private markets: string[] = [];
    private readonly load_markets: UserMarketsProvider;

    constructor(publisher: PolymarketPublisher, load_markets: UserMarketsProvider) {
        super("user", publisher);
        this.load_markets = load_markets;
    }

    protected get_url(): string {
        return ENV.SERVER_POLYMARKET_WS_URL + POLY_WS.user_path;
    }

    protected get_subscribe_frame(): object | null {
        if (this.markets.length === 0) return null;
        const auth = build_polymarket_auth();
        return { type: "USER", markets: this.markets, auth };
    }

    public override async connect(): Promise<void> {
        // refresh market list on every (re)connect so new markets get picked up
        try {
            this.markets = await this.load_markets();
        } catch (err) {
            console.error("[poly:user] load_markets failed", err);
            this.markets = [];
        }
        if (this.markets.length === 0) {
            // Polymarket drops sockets that open without an immediate subscribe
            // frame, so skip connecting until there's something to watch.
            console.warn("[poly:user] no markets to subscribe to — skipping connect");
            return;
        }
        await super.connect();
    }

    protected handle_message(msg: unknown): void {
        if (!is_user_event(msg)) return;
        void this.publisher.publish_user(msg);
    }
}

function is_user_event(msg: unknown): msg is UserEvent {
    if (!msg || typeof msg !== "object") return false;
    const t = (msg as { event_type?: unknown }).event_type;
    return t === "trade" || t === "order";
}
