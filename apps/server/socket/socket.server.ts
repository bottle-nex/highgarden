import { WebSocket, WebSocketServer } from "ws";
import type { Server, IncomingMessage } from "http";
import type { Duplex } from "stream";
import { verifySessionJwt } from "../services/service.jwt";
import RedisSubscriber from "./socket.subscriber";
import { SERVER_MESSAGE_TYPE, CLIENT_MESSAGE_TYPE } from "@solmarket/types";
import type { ServerMessage, ClientMessage, CustomWebSocketFields } from "@solmarket/types";
import type MirrorControlPublisher from "../services/service.mirror-control";
import type BookCache from "../services/service.book-cache";
import chalk from "chalk";

export interface CustomWebSocket extends WebSocket, CustomWebSocketFields {}

export default class SocketServer {
    private wss: WebSocketServer;
    public readonly subscriber: RedisSubscriber;
    private socket_mapping = new Map<string, CustomWebSocket>(); // Map<ws.id, CustomWebSocket>
    private email_socket = new Map<string, string>();             // Map<email, ws.id>
    private client_subs = new Map<string, Set<string>>();         // Map<ws.id, Set<token_id>>
    private token_clients = new Map<string, Set<string>>();       // Map<token_id, Set<ws.id>>

    constructor(
        server: Server,
        redis_url: string,
        mirror_control: MirrorControlPublisher,
        book_cache: BookCache,
    ) {
        this.wss = new WebSocketServer({ noServer: true });
        this.subscriber = new RedisSubscriber(
            redis_url,
            this.route_redis_message.bind(this),
            mirror_control,
            book_cache,
        );

        server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
            const claims = this.authenticate(req);
            if (!claims) {
                socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
                socket.destroy();
                return;
            }
            this.wss.handleUpgrade(req, socket, head, (raw_ws) => {
                const ws = raw_ws as CustomWebSocket;
                ws.id = crypto.randomUUID();
                ws.user = { id: claims.sub, email: claims.email };
                this.wss.emit("connection", ws, req);
            });
        });

        this.wss.on("connection", (raw_ws: WebSocket) => {
            const ws = raw_ws as CustomWebSocket;
            console.log(chalk.bgGreen("socket connected"), ws.user.email, chalk.gray(ws.id));

            this.evict_existing(ws.user.email, ws.id);

            this.socket_mapping.set(ws.id, ws);
            this.email_socket.set(ws.user.email, ws.id);
            this.client_subs.set(ws.id, new Set());

            ws.on("message", (raw: Buffer) => {
                this.on_client_message(ws, raw.toString());
            });

            ws.on("close", () => {
                console.log(chalk.bgRed("socket disconnected"), ws.user.email, chalk.gray(ws.id));
                this.on_client_close(ws);
            });

            ws.on("error", (err) => {
                console.log(chalk.bgRed("socket disconnected with error"), ws.user.email, chalk.gray(ws.id), err);
                ws.close();
            });
        });
    }

    private evict_existing(email: string, new_ws_id: string): void {
        const old_ws_id = this.email_socket.get(email);
        if (!old_ws_id || old_ws_id === new_ws_id) return;

        const old_ws = this.socket_mapping.get(old_ws_id);
        console.log(chalk.yellow("[ws] evicting old socket for"), email, chalk.gray(old_ws_id));

        this.cleanup_socket(old_ws_id, email);
        old_ws?.close(1000, "replaced by new connection");
    }

    public async shutdown(): Promise<void> {
        for (const ws of this.socket_mapping.values()) {
            ws.close(1001, "server shutting down");
        }
        this.socket_mapping.clear();
        this.email_socket.clear();
        this.client_subs.clear();
        this.token_clients.clear();
        this.wss.close();
        await this.subscriber.shutdown();
    }

    private on_client_message(ws: CustomWebSocket, raw: string): void {
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

    private handle_subscribe(ws: CustomWebSocket, token_id: string): void {
        const subs = this.client_subs.get(ws.id);
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
        clients.add(ws.id);

        console.log(chalk.green("→ subscribe  "), ws.user.email, token_id);

        this.subscriber.subscribe(token_id);
        this.fetch_and_send_book(ws, token_id);
        this.send(ws, { type: SERVER_MESSAGE_TYPE.SUBSCRIBED, token_id });
    }

    private handle_unsubscribe(ws: CustomWebSocket, token_id: string): void {
        const subs = this.client_subs.get(ws.id);
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
            clients.delete(ws.id);
            if (clients.size === 0) {
                this.token_clients.delete(token_id);
            }
        }

        console.log(chalk.yellow("← unsubscribe"), ws.user.email, token_id);

        this.subscriber.unsubscribe(token_id);
        this.send(ws, { type: SERVER_MESSAGE_TYPE.UNSUBSCRIBED, token_id });
    }

    private on_client_close(ws: CustomWebSocket): void {
        // Only clear email mapping if this socket is still the active one —
        // evict_existing may have already replaced it with a newer connection.
        if (this.email_socket.get(ws.user.email) === ws.id) {
            this.email_socket.delete(ws.user.email);
        }
        this.cleanup_socket(ws.id, ws.user.email);
    }

    private cleanup_socket(ws_id: string, email: string): void {
        const subs = this.client_subs.get(ws_id);
        if (subs) {
            for (const token_id of subs) {
                const clients = this.token_clients.get(token_id);
                if (clients) {
                    clients.delete(ws_id);
                    if (clients.size === 0) {
                        this.token_clients.delete(token_id);
                    }
                }
                console.log(chalk.yellow("← unsubscribe"), chalk.gray("[disconnect]"), email, token_id);
                this.subscriber.unsubscribe(token_id);
            }
        }
        this.client_subs.delete(ws_id);
        this.socket_mapping.delete(ws_id);
    }

    private fetch_and_send_book(ws: CustomWebSocket, token_id: string): void {
        console.log(chalk.cyan("[ws:book] fetching"), ws.user.email, token_id);
        void (async () => {
            try {
                const res = await fetch(`https://clob.polymarket.com/book?token_id=${token_id}`);
                console.log(chalk.cyan("[ws:book] response"), token_id, chalk.gray(`status=${res.status} ws_state=${ws.readyState}`));
                if (!res.ok) {
                    console.warn(chalk.yellow("[ws:book] fetch failed"), token_id, res.status);
                    return;
                }
                const data = await res.json() as Record<string, unknown>;
                console.log(chalk.cyan("[ws:book] parsed"), token_id, chalk.gray(`bids=${Array.isArray(data.bids) ? (data.bids as unknown[]).length : "NOT_ARRAY"} asks=${Array.isArray(data.asks) ? (data.asks as unknown[]).length : "NOT_ARRAY"}`));
                if (!Array.isArray(data.bids) || !Array.isArray(data.asks)) return;
                const event = {
                    event_type: "book" as const,
                    asset_id: token_id,
                    market: typeof data.market === "string" ? data.market : "",
                    bids: data.bids as Array<{ price: string; size: string }>,
                    asks: data.asks as Array<{ price: string; size: string }>,
                    timestamp: typeof data.timestamp === "string" ? data.timestamp : new Date().toISOString(),
                    hash: typeof data.hash === "string" ? data.hash : "",
                };
                if (ws.readyState !== ws.OPEN) {
                    console.warn(chalk.yellow("[ws:book] ws closed before send"), token_id, chalk.gray(`ws_state=${ws.readyState}`));
                    return;
                }
                console.log(chalk.cyan("→ book fetch "), ws.user.email, token_id, chalk.gray(`bids=${event.bids.length} asks=${event.asks.length}`));
                this.send(ws, { type: SERVER_MESSAGE_TYPE.MARKET, event });
            } catch (err) {
                console.warn(chalk.yellow("[ws:book] fetch error"), token_id, err);
            }
        })();
    }

    private route_redis_message(token_id: string, data: string): void {
        const ws_ids = this.token_clients.get(token_id);
        if (!ws_ids || ws_ids.size === 0) return;

        let event: unknown;
        try {
            event = JSON.parse(data);
        } catch {
            return;
        }

        const payload = JSON.stringify({ type: SERVER_MESSAGE_TYPE.MARKET, event });

        for (const ws_id of ws_ids) {
            const ws = this.socket_mapping.get(ws_id);
            if (ws && ws.readyState === ws.OPEN) {
                ws.send(payload);
            }
        }
    }

    public snapshot_clients(): Map<string, number> {
        const counts = new Map<string, number>();
        for (const [token_id, ws_ids] of this.token_clients) {
            counts.set(token_id, ws_ids.size);
        }
        return counts;
    }

    private authenticate(req: IncomingMessage) {
        try {
            const url = new URL(req.url || "", `http://${req.headers.host}`);
            const token = url.searchParams.get("token");
            if (!token) return null;
            return verifySessionJwt(token);
        } catch {
            return null;
        }
    }

    private send(ws: CustomWebSocket, msg: ServerMessage): void {
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
