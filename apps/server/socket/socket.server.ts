import { WebSocket, WebSocketServer } from "ws";
import type { Server, IncomingMessage } from "http";
import type { Duplex } from "stream";
import { verifySessionJwt } from "../services/service.jwt";
import { ENV } from "../config/config.env";
import RedisSubscriber from "./socket.subscriber";
import { SERVER_MESSAGE_TYPE, CLIENT_MESSAGE_TYPE } from "@solmarket/types";
import type { ServerMessage, ClientMessage, CustomWebSocketFields } from "@solmarket/types";
import type MirrorControlPublisher from "../services/service.mirror-control";
import type BookCache from "../services/service.book-cache";

export interface CustomWebSocket extends WebSocket, CustomWebSocketFields {}

// ─── Guardrail config ────────────────────────────────────────────────────────
// Tunable via env. Defaults are conservative — adjust for production load.

const MAX_CONNECTIONS_PER_IP = Number(process.env.SERVER_WS_MAX_CONN_PER_IP ?? 10);
const MAX_SUBSCRIPTIONS_PER_SOCKET = Number(process.env.SERVER_WS_MAX_SUBS_PER_SOCKET ?? 50);
// Snapshot fetch cache TTL — coalesces bursty subscribes for the same token.
const SNAPSHOT_CACHE_TTL_MS = Number(process.env.SERVER_WS_SNAPSHOT_TTL_MS ?? 1500);

interface SnapshotEntry {
    snapshot: BookSnapshotPayload | null;
    fetched_at: number;
    in_flight: Promise<BookSnapshotPayload | null> | null;
}

interface BookSnapshotPayload {
    event_type: "book";
    asset_id: string;
    market: string;
    bids: Array<{ price: string; size: string }>;
    asks: Array<{ price: string; size: string }>;
    timestamp: string;
    hash: string;
}

export default class SocketServer {
    private wss: WebSocketServer;
    public readonly subscriber: RedisSubscriber;
    private socket_mapping = new Map<string, CustomWebSocket>(); // Map<ws.id, CustomWebSocket>
    private email_socket = new Map<string, string>(); // Map<email, ws.id>  (auth users only)
    private client_subs = new Map<string, Set<string>>(); // Map<ws.id, Set<token_id>>
    private token_clients = new Map<string, Set<string>>(); // Map<token_id, Set<ws.id>>
    private ip_conn_count = new Map<string, number>(); // Map<ip, concurrent connection count>
    private snapshot_cache = new Map<string, SnapshotEntry>(); // Map<token_id, cached book snapshot>
    private allowed_origins: Set<string>;

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

        this.allowed_origins = this.build_allowed_origins();

        server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
            // Origin check — reject connections from disallowed origins to stop
            // random scrapers and 3rd-party sites from camping on our socket.
            // Browsers always send Origin; non-browser clients (curl, custom
            // scripts) may omit it — we accept those only when explicitly
            // configured to (NODE_ENV != production).
            const origin = req.headers.origin;
            if (!this.is_origin_allowed(origin)) {
                console.warn("[ws] origin rejected", origin ?? "<none>");
                socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
                socket.destroy();
                return;
            }

            // Per-IP connection cap — prevents a single bad actor from opening
            // an unbounded number of guest sockets.
            const ip = this.client_ip(req);
            const current = this.ip_conn_count.get(ip) ?? 0;
            if (current >= MAX_CONNECTIONS_PER_IP) {
                console.warn("[ws] ip cap hit", ip, `count=${current}`);
                socket.write("HTTP/1.1 429 Too Many Requests\r\n\r\n");
                socket.destroy();
                return;
            }

            // Authentication is OPTIONAL. A valid JWT yields an authed user;
            // missing / invalid token yields a guest connection that can only
            // subscribe to public market-data channels.
            const claims = this.authenticate(req);

            this.ip_conn_count.set(ip, current + 1);

            this.wss.handleUpgrade(req, socket, head, (raw_ws) => {
                const ws = raw_ws as CustomWebSocket;
                ws.id = crypto.randomUUID();
                ws.user = claims ? { id: claims.sub, email: claims.email } : null;
                // Stash IP on the ws so we can decrement the per-IP counter on close.
                (ws as unknown as { __ip?: string }).__ip = ip;
                this.wss.emit("connection", ws, req);
            });
        });

        this.wss.on("connection", (raw_ws: WebSocket) => {
            const ws = raw_ws as CustomWebSocket;
            const label = this.label_for(ws);
            console.log("socket connected", label, ws.id);

            // Single-session-per-email is enforced for AUTHED users only;
            // guests have no identity and each connection is independent.
            if (ws.user) this.evict_existing(ws.user.email, ws.id);

            this.socket_mapping.set(ws.id, ws);
            if (ws.user) this.email_socket.set(ws.user.email, ws.id);
            this.client_subs.set(ws.id, new Set());

            ws.on("message", (raw: Buffer) => {
                this.on_client_message(ws, raw.toString());
            });

            ws.on("close", () => {
                console.log("socket disconnected", label, ws.id);
                this.on_client_close(ws);
            });

            ws.on("error", (err) => {
                console.log("socket disconnected with error", label, ws.id, err);
                ws.close();
            });
        });
    }

    private build_allowed_origins(): Set<string> {
        const out = new Set<string>();
        // Primary configured frontend origin (e.g. https://solmarket.xyz).
        const primary = (() => {
            try {
                return ENV.SERVER_WEB_ORIGIN;
            } catch {
                return undefined;
            }
        })();
        if (primary) out.add(primary.replace(/\/$/, ""));

        // Optional comma-separated list for additional origins (preview deploys, staging).
        const extra = process.env.SERVER_WS_ALLOWED_ORIGINS;
        if (extra) {
            for (const o of extra.split(",")) {
                const trimmed = o.trim().replace(/\/$/, "");
                if (trimmed) out.add(trimmed);
            }
        }

        // Local dev convenience: always allow localhost variants when not in production.
        if (process.env.NODE_ENV !== "production") {
            out.add("http://localhost:3000");
            out.add("http://127.0.0.1:3000");
        }

        return out;
    }

    private is_origin_allowed(origin: string | undefined): boolean {
        // Non-browser clients (no Origin header) — only allow outside production.
        if (!origin) return process.env.NODE_ENV !== "production";
        const normalized = origin.replace(/\/$/, "");
        return this.allowed_origins.has(normalized);
    }

    private client_ip(req: IncomingMessage): string {
        // Honor the first entry of x-forwarded-for when present (typical when
        // we sit behind a reverse proxy / load balancer).
        const xff = req.headers["x-forwarded-for"];
        if (typeof xff === "string" && xff.length > 0) {
            const first = xff.split(",")[0]?.trim();
            if (first) return first;
        }
        return req.socket.remoteAddress ?? "unknown";
    }

    private label_for(ws: CustomWebSocket): string {
        return ws.user ? ws.user.email : "guest";
    }

    private evict_existing(email: string, new_ws_id: string): void {
        const old_ws_id = this.email_socket.get(email);
        if (!old_ws_id || old_ws_id === new_ws_id) return;

        const old_ws = this.socket_mapping.get(old_ws_id);
        console.log("[ws] evicting old socket for", email, old_ws_id);

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
        this.ip_conn_count.clear();
        this.snapshot_cache.clear();
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

        // Per-socket subscription cap — prevents a single client from
        // ballooning Redis subscriber memory by subscribing to thousands of
        // tokens.
        if (subs.size >= MAX_SUBSCRIPTIONS_PER_SOCKET) {
            console.warn(
                "[ws] subscription cap hit",
                this.label_for(ws),
                `cap=${MAX_SUBSCRIPTIONS_PER_SOCKET}`,
            );
            this.send(ws, {
                type: SERVER_MESSAGE_TYPE.ERROR,
                message: `subscription limit reached (${MAX_SUBSCRIPTIONS_PER_SOCKET})`,
            });
            return;
        }

        // NOTE: All current channels are public market data — anyone (auth or
        // guest) may subscribe. When user-specific channels are added, gate
        // them here:  if (channel.is_user_scoped && !ws.user) reject.

        subs.add(token_id);

        let clients = this.token_clients.get(token_id);
        if (!clients) {
            clients = new Set();
            this.token_clients.set(token_id, clients);
        }
        clients.add(ws.id);

        console.log("→ subscribe  ", this.label_for(ws), token_id);

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

        console.log("← unsubscribe", this.label_for(ws), token_id);

        this.subscriber.unsubscribe(token_id);
        this.send(ws, { type: SERVER_MESSAGE_TYPE.UNSUBSCRIBED, token_id });
    }

    private on_client_close(ws: CustomWebSocket): void {
        // Decrement per-IP counter regardless of auth state.
        const ip = (ws as unknown as { __ip?: string }).__ip;
        if (ip) {
            const current = this.ip_conn_count.get(ip) ?? 0;
            if (current <= 1) this.ip_conn_count.delete(ip);
            else this.ip_conn_count.set(ip, current - 1);
        }

        // Only clear email mapping if this socket is still the active one —
        // evict_existing may have already replaced it with a newer connection.
        if (ws.user && this.email_socket.get(ws.user.email) === ws.id) {
            this.email_socket.delete(ws.user.email);
        }
        this.cleanup_socket(ws.id, this.label_for(ws));
    }

    private cleanup_socket(ws_id: string, label: string): void {
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
                console.log("← unsubscribe", "[disconnect]", label, token_id);
                this.subscriber.unsubscribe(token_id);
            }
        }
        this.client_subs.delete(ws_id);
        this.socket_mapping.delete(ws_id);
    }

    /**
     * Send the initial orderbook snapshot to a newly subscribed client.
     *
     * Bursty subscribes (e.g. multiple clients hitting the same token within
     * a few hundred ms) used to trigger one fetch to clob.polymarket.com per
     * subscribe. Now we coalesce: a per-token TTL cache returns the last
     * snapshot when fresh, and concurrent calls await the same in-flight
     * promise. Public-socket exposure means anonymous traffic could otherwise
     * amplify into upstream rate limiting.
     */
    private fetch_and_send_book(ws: CustomWebSocket, token_id: string): void {
        const label = this.label_for(ws);
        console.log("[ws:book] fetching", label, token_id);
        void (async () => {
            try {
                const snapshot = await this.get_book_snapshot(token_id);
                if (!snapshot) return;
                if (ws.readyState !== ws.OPEN) {
                    console.warn(
                        "[ws:book] ws closed before send",
                        token_id,
                        `ws_state=${ws.readyState}`,
                    );
                    return;
                }
                console.log(
                    "→ book fetch ",
                    label,
                    token_id,
                    `bids=${snapshot.bids.length} asks=${snapshot.asks.length}`,
                );
                this.send(ws, { type: SERVER_MESSAGE_TYPE.MARKET, event: snapshot });
            } catch (err) {
                console.warn("[ws:book] fetch error", token_id, err);
            }
        })();
    }

    private async get_book_snapshot(token_id: string): Promise<BookSnapshotPayload | null> {
        const now = Date.now();
        const existing = this.snapshot_cache.get(token_id);

        if (existing) {
            // In-flight: every concurrent caller awaits the same promise.
            if (existing.in_flight) return existing.in_flight;
            // Fresh cached snapshot — return as-is.
            if (existing.snapshot && now - existing.fetched_at < SNAPSHOT_CACHE_TTL_MS) {
                return existing.snapshot;
            }
        }

        const promise = this.do_fetch_book_snapshot(token_id);
        const entry: SnapshotEntry = {
            snapshot: existing?.snapshot ?? null,
            fetched_at: existing?.fetched_at ?? 0,
            in_flight: promise,
        };
        this.snapshot_cache.set(token_id, entry);

        try {
            const result = await promise;
            entry.snapshot = result;
            entry.fetched_at = Date.now();
            entry.in_flight = null;
            return result;
        } catch (err) {
            entry.in_flight = null;
            throw err;
        }
    }

    private async do_fetch_book_snapshot(token_id: string): Promise<BookSnapshotPayload | null> {
        const res = await fetch(`https://clob.polymarket.com/book?token_id=${token_id}`);
        console.log("[ws:book] response", token_id, `status=${res.status}`);
        if (!res.ok) {
            console.warn("[ws:book] fetch failed", token_id, res.status);
            return null;
        }
        const data = (await res.json()) as Record<string, unknown>;
        if (!Array.isArray(data.bids) || !Array.isArray(data.asks)) return null;
        return {
            event_type: "book",
            asset_id: token_id,
            market: typeof data.market === "string" ? data.market : "",
            bids: data.bids as Array<{ price: string; size: string }>,
            asks: data.asks as Array<{ price: string; size: string }>,
            timestamp:
                typeof data.timestamp === "string" ? data.timestamp : new Date().toISOString(),
            hash: typeof data.hash === "string" ? data.hash : "",
        };
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
