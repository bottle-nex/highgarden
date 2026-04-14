import type { Server } from "http";
import { WebSocketServer, type WebSocket } from "ws";
import type { BookSimulator, BookSnapshot } from "../book";

interface SocketState {
    subscriptions: Set<string>;
    unsubscribe: () => void;
}

export class MarketWsGateway {
    private wss: WebSocketServer | null = null;
    private readonly clientState: WeakMap<WebSocket, SocketState> = new WeakMap();

    constructor(private readonly simulator: BookSimulator) {}

    attach(server: Server, path: string = "/ws"): void {
        this.wss = new WebSocketServer({ server, path });
        this.wss.on("connection", (ws: WebSocket) => this.handleConnection(ws));
    }

    close(): void {
        this.wss?.close();
        this.wss = null;
    }

    private handleConnection(ws: WebSocket): void {
        const subscriptions = new Set<string>();
        const unsubscribe = this.simulator.subscribe(({ tokenId, type, snapshot }) => {
            if (!subscriptions.has(tokenId)) return;
            ws.send(JSON.stringify(MarketWsGateway.formatEvent(tokenId, type, snapshot)));
        });
        this.clientState.set(ws, { subscriptions, unsubscribe });

        ws.on("message", (raw: Buffer) => this.handleMessage(ws, subscriptions, raw));
        ws.on("close", () => this.handleClose(ws));
    }

    private handleMessage(ws: WebSocket, subscriptions: Set<string>, raw: Buffer): void {
        let msg: { type?: string; assets_ids?: string[] };
        try {
            msg = JSON.parse(raw.toString());
        } catch {
            ws.send(JSON.stringify({ error: "invalid_json" }));
            return;
        }
        if (msg.type === "subscribe" && Array.isArray(msg.assets_ids)) {
            for (const id of msg.assets_ids) subscriptions.add(id);
            ws.send(JSON.stringify({ type: "subscribed", assets_ids: msg.assets_ids }));
            for (const id of msg.assets_ids) {
                const snap = this.simulator.getSnapshot(id);
                if (!snap) continue;
                ws.send(JSON.stringify(MarketWsGateway.formatEvent(id, "book", snap)));
            }
        }
    }

    private handleClose(ws: WebSocket): void {
        this.clientState.get(ws)?.unsubscribe();
        this.clientState.delete(ws);
    }

    private static formatEvent(
        tokenId: string,
        type: "book" | "price_change" | "last_trade_price",
        snapshot: BookSnapshot,
    ): object {
        return {
            channel: "market",
            event_type: type,
            asset_id: tokenId,
            asks: snapshot.asks,
            bids: snapshot.bids,
            last_trade_price: snapshot.lastTradePriceCents / 100,
            timestamp: snapshot.updatedAt,
        };
    }
}
