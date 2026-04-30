import { WebSocketServer, type WebSocket } from "ws";
import type { Server, IncomingMessage } from "http";
import type { Duplex } from "stream";
import { verifySessionJwt } from "../services/service.jwt";
import RedisSubscriber from "./socket.subscriber";
import { SERVER_MESSAGE_TYPE, CLIENT_MESSAGE_TYPE } from "@solmarket/types";
import type { ServerMessage, ClientMessage } from "@solmarket/types";

export default class SocketServer {
    private wss: WebSocketServer;
    public readonly subscriber: RedisSubscriber;
    private client_subs = new Map<WebSocket, Set<string>>();
    private token_clients = new Map<string, Set<WebSocket>>();
    /** Optional marketId/name resolver injected after construction. */
    public label_for: ((token_id: string) => string) | null = null;

    constructor(server: Server, redis_url: string) {
        this.wss = new WebSocketServer({ noServer: true });
        this.subscriber = new RedisSubscriber(redis_url, this.route_redis_message.bind(this));

        server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
            if (!this.authenticate(req)) {
                socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
                socket.destroy();
                return;
            }
            this.wss.handleUpgrade(req, socket, head, (ws) => {
                this.wss.emit("connection", ws, req);
            });
        });

        this.wss.on("connection", (ws: WebSocket) => {
            this.client_subs.set(ws, new Set());

            ws.on("message", (raw: Buffer) => {
                this.on_client_message(ws, raw.toString());
            });

            ws.on("close", () => {
                this.on_client_close(ws);
            });

            ws.on("error", (err) => {
                console.error("[ws:server] client error:", err.message);
                ws.close();
            });
        });

        console.log("[ws:server] websocket server attached");
    }

    public async shutdown(): Promise<void> {
        for (const ws of this.client_subs.keys()) {
            ws.close(1001, "server shutting down");
        }
        this.client_subs.clear();
        this.token_clients.clear();
        this.wss.close();
        await this.subscriber.shutdown();
    }

    private on_client_message(ws: WebSocket, raw: string): void {
        const msg = this.parse_client_message(raw);
        if (!msg) {
            this.send(ws, { type: SERVER_MESSAGE_TYPE.ERROR, message: "invalid message format" });
            return;
        }

        switch (msg.type) {
            case CLIENT_MESSAGE_TYPE.PING:
                this.send(ws, { type: SERVER_MESSAGE_TYPE.PONG });
                return;

            case CLIENT_MESSAGE_TYPE.SUBSCRIBE:
                this.handle_subscribe(ws, msg.token_id);
                return;

            case CLIENT_MESSAGE_TYPE.UNSUBSCRIBE:
                this.handle_unsubscribe(ws, msg.token_id);
                return;
        }
    }

    private handle_subscribe(ws: WebSocket, token_id: string): void {
        const subs = this.client_subs.get(ws);
        if (!subs) return;

        if (subs.has(token_id)) {
            this.send(ws, {
                type: SERVER_MESSAGE_TYPE.ERROR,
                message: `already subscribed to ${token_id}`,
            });
            return;
        }

        subs.add(token_id);

        let clients = this.token_clients.get(token_id);
        if (!clients) {
            clients = new Set();
            this.token_clients.set(token_id, clients);
        }
        clients.add(ws);

        this.subscriber.subscribe(token_id);
        this.send(ws, { type: SERVER_MESSAGE_TYPE.SUBSCRIBED, token_id });
    }

    private handle_unsubscribe(ws: WebSocket, token_id: string): void {
        const subs = this.client_subs.get(ws);
        if (!subs || !subs.has(token_id)) {
            this.send(ws, {
                type: SERVER_MESSAGE_TYPE.ERROR,
                message: `not subscribed to ${token_id}`,
            });
            return;
        }

        subs.delete(token_id);
        const clients = this.token_clients.get(token_id);
        if (clients) {
            clients.delete(ws);
            if (clients.size === 0) {
                this.token_clients.delete(token_id);
            }
        }

        this.subscriber.unsubscribe(token_id);
        this.send(ws, { type: SERVER_MESSAGE_TYPE.UNSUBSCRIBED, token_id });
    }

    private on_client_close(ws: WebSocket): void {
        const subs = this.client_subs.get(ws);
        if (subs) {
            for (const token_id of subs) {
                const clients = this.token_clients.get(token_id);
                if (clients) {
                    clients.delete(ws);
                    if (clients.size === 0) {
                        this.token_clients.delete(token_id);
                    }
                }
                this.subscriber.unsubscribe(token_id);
            }
        }
        this.client_subs.delete(ws);
    }

    private route_redis_message(token_id: string, data: string): void {
        const clients = this.token_clients.get(token_id);
        const label = this.label_for?.(token_id) ?? short(token_id);
        if (!clients || clients.size === 0) {
            console.log(`[5.ws-srv→client] DROP market=${label} no_subscribed_clients`);
            return;
        }

        let event: unknown;
        try {
            event = JSON.parse(data);
        } catch {
            return;
        }

        const payload = JSON.stringify({ type: SERVER_MESSAGE_TYPE.MARKET, event });

        let sent = 0;
        for (const ws of clients) {
            if (ws.readyState === ws.OPEN) {
                ws.send(payload);
                sent++;
            }
        }
        console.log(`[5.ws-srv→client] send market=${label} clients=${sent}`);
    }

    public snapshot_clients(): Map<string, number> {
        const counts = new Map<string, number>();
        for (const [token_id, sockets] of this.token_clients) {
            counts.set(token_id, sockets.size);
        }
        return counts;
    }

    private authenticate(req: IncomingMessage): boolean {
        try {
            const url = new URL(req.url || "", `http://${req.headers.host}`);
            const token = url.searchParams.get("token");
            if (!token) return false;
            verifySessionJwt(token);
            return true;
        } catch {
            return false;
        }
    }

    private send(ws: WebSocket, msg: ServerMessage): void {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify(msg));
        }
    }

    private parse_client_message(raw: string): ClientMessage | null {
        try {
            const obj = JSON.parse(raw);
            if (typeof obj !== "object" || obj === null) return null;

            if (obj.type === CLIENT_MESSAGE_TYPE.PING) return { type: CLIENT_MESSAGE_TYPE.PING };

            if (
                (obj.type === CLIENT_MESSAGE_TYPE.SUBSCRIBE ||
                    obj.type === CLIENT_MESSAGE_TYPE.UNSUBSCRIBE) &&
                typeof obj.token_id === "string" &&
                obj.token_id.length > 0
            ) {
                return { type: obj.type, token_id: obj.token_id };
            }

            return null;
        } catch {
            return null;
        }
    }
}

function short(token_id: string): string {
    if (token_id.length <= 12) return token_id;
    return `${token_id.slice(0, 8)}…${token_id.slice(-4)}`;
}
