import { WebSocketServer, type WebSocket } from "ws";
import type { Server, IncomingMessage } from "http";
import type { Duplex } from "stream";
import { verifySessionJwt, type SessionClaims } from "../services/service.jwt";
import RedisSubscriber from "./socket.subscriber";
import { SERVER_MESSAGE_TYPE, CLIENT_MESSAGE_TYPE } from "@solmarket/types";
import type { ServerMessage, ClientMessage } from "@solmarket/types";
import type MirrorControlPublisher from "../services/service.mirror-control";
import type BookCache from "../services/service.book-cache";
import chalk from "chalk";

export default class SocketServer {
    private wss: WebSocketServer;
    public readonly subscriber: RedisSubscriber;
    private client_subs = new Map<WebSocket, Set<string>>();
    private token_clients = new Map<string, Set<WebSocket>>();
    private client_claims = new Map<WebSocket, SessionClaims>();

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
            this.wss.handleUpgrade(req, socket, head, (ws) => {
                this.client_claims.set(ws, claims);
                this.wss.emit("connection", ws, req);
            });
        });

        this.wss.on("connection", (ws: WebSocket) => {
            const who = this.who(ws);
            console.log(chalk.bgGreen('socket connected'), who);
            this.client_subs.set(ws, new Set());

            ws.on("message", (raw: Buffer) => {
                this.on_client_message(ws, raw.toString());
            });

            ws.on("close", () => {
                console.log(chalk.bgRed('socket disconnected'), who);
                this.on_client_close(ws);
            });

            ws.on("error", (err) => {
                console.log(chalk.bgRed('socket disconnected with error'), who, err);
                ws.close();
            });
        });
    }

    private who(ws: WebSocket): string {
        return this.client_claims.get(ws)?.email ?? "unknown";
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

        console.log(chalk.green("→ subscribe  "), this.who(ws), token_id);

        this.subscriber.subscribe(token_id);
        this.fetch_and_send_book(ws, token_id);
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

        console.log(chalk.yellow("← unsubscribe"), this.who(ws), token_id);

        this.subscriber.unsubscribe(token_id);
        this.send(ws, { type: SERVER_MESSAGE_TYPE.UNSUBSCRIBED, token_id });
    }

    private on_client_close(ws: WebSocket): void {
        const who = this.who(ws);
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
                console.log(chalk.yellow("← unsubscribe"), chalk.gray("[disconnect]"), who, token_id);
                this.subscriber.unsubscribe(token_id);
            }
        }
        this.client_subs.delete(ws);
        this.client_claims.delete(ws);
    }

    private fetch_and_send_book(ws: WebSocket, token_id: string): void {
        console.log(chalk.cyan("[ws:book] fetching"), this.who(ws), token_id);
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
                console.log(chalk.cyan("→ book fetch "), this.who(ws), token_id, chalk.gray(`bids=${event.bids.length} asks=${event.asks.length}`));
                this.send(ws, { type: SERVER_MESSAGE_TYPE.MARKET, event });
            } catch (err) {
                console.warn(chalk.yellow("[ws:book] fetch error"), token_id, err);
            }
        })();
    }

    private route_redis_message(token_id: string, data: string): void {
        const clients = this.token_clients.get(token_id);
        if (!clients || clients.size === 0) {
            return;
        }

        let event: unknown;
        try {
            event = JSON.parse(data);
        } catch {
            return;
        }

        const payload = JSON.stringify({ type: SERVER_MESSAGE_TYPE.MARKET, event });

        for (const ws of clients) {
            if (ws.readyState === ws.OPEN) {
                ws.send(payload);
            }
        }
    }

    public snapshot_clients(): Map<string, number> {
        const counts = new Map<string, number>();
        for (const [token_id, sockets] of this.token_clients) {
            counts.set(token_id, sockets.size);
        }
        return counts;
    }

    private authenticate(req: IncomingMessage): SessionClaims | null {
        try {
            const url = new URL(req.url || "", `http://${req.headers.host}`);
            const token = url.searchParams.get("token");
            if (!token) return null;
            return verifySessionJwt(token);
        } catch {
            return null;
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
