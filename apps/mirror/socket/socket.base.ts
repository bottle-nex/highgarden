import { WebSocket } from "ws";
import type { SocketState } from "@solmarket/polymarket-contracts";
import { POLY_WS } from "../config/config.polymarket";
import type PolymarketPublisher from "../services/service.polymarket.publisher";
import type TokenIndex from "../services/service.token-index";

export abstract class SocketBase {
    protected ws: WebSocket | null = null;
    protected state: SocketState = "idle";
    private heartbeat_timer: ReturnType<typeof setInterval> | null = null;
    private reconnect_timer: ReturnType<typeof setTimeout> | null = null;
    private reconnect_delay: number = POLY_WS.reconnect_initial_ms;
    private send_queue: string[] = [];
    private stopped: boolean = false;

    protected readonly name: "market" | "user";
    protected readonly publisher: PolymarketPublisher;
    protected readonly token_index: TokenIndex;

    /** Called after every successful WSS open (initial connect and reconnects). */
    public on_open_hook: (() => void) | null = null;

    constructor(name: "market" | "user", publisher: PolymarketPublisher, token_index: TokenIndex) {
        this.name = name;
        this.publisher = publisher;
        this.token_index = token_index;
    }

    protected abstract get_url(): string;
    protected abstract get_subscribe_frame(): object | null;
    // eslint-disable-next-line no-unused-vars
    protected abstract handle_message(msg: unknown): void;

    public async connect(): Promise<void> {
        console.log(`[poly:${this.name}] connect()`, `state=${this.state} stopped=${this.stopped}`);
        if (this.state === "open" || this.state === "connecting") {
            console.log(`[poly:${this.name}] connect() skipped — already ${this.state}`);
            return;
        }
        this.stopped = false;
        this.clear_timers(); // cancel any pending reconnect so this connect wins
        this.set_state("connecting");

        let ws: WebSocket;
        try {
            ws = new WebSocket(this.get_url());
        } catch (err) {
            console.error(`[poly:${this.name}] ctor failed`, err);
            this.schedule_reconnect();
            return;
        }

        this.ws = ws;
        ws.on("open", () => {
            if (this.ws !== ws) return; // stale — a newer ws was already assigned
            this.on_open();
        });
        ws.on("message", (data) => this.on_message(data.toString()));
        ws.on("close", (code, reason) => {
            if (this.ws !== ws) return; // stale close from a replaced ws — ignore
            this.on_close(code, reason.toString());
        });
        ws.on("error", (err) => {
            console.error(`[poly:${this.name}] error`, err);
        });
    }

    public async stop(): Promise<void> {
        this.stopped = true;
        this.clear_timers();
        this.set_state("closing");
        try {
            this.ws?.close(1000, "shutdown");
            //eslint-disable-next-line no-empty
        } catch {}
        this.ws = null;
        this.set_state("closed");
    }

    protected send(payload: object): void {
        const raw = JSON.stringify(payload);
        if (this.state === "open" && this.ws) {
            this.ws.send(raw);
        } else {
            this.send_queue.push(raw);
        }
    }

    private on_open(): void {
        console.log(`[poly:${this.name}] ws opened`);
        this.set_state("open");
        this.reconnect_delay = POLY_WS.reconnect_initial_ms;

        const frame = this.get_subscribe_frame();
        if (frame) {
            const ids = (frame as { assets_ids?: string[] }).assets_ids ?? [];
            console.log(`[poly:${this.name}] sending subscribe frame`, `tokens=${ids.length}`, ids);
            this.ws!.send(JSON.stringify(frame));
        } else {
            console.log(
                `[poly:${this.name}] no tokens in registry at open — skipping subscribe frame`,
            );
        }

        while (this.send_queue.length > 0 && this.ws) {
            this.ws.send(this.send_queue.shift()!);
        }

        this.heartbeat_timer = setInterval(() => {
            try {
                this.ws?.send("PING");
                //eslint-disable-next-line no-empty
            } catch {}
        }, POLY_WS.heartbeat_ms);

        try {
            this.on_open_hook?.();
        } catch (err) {
            console.warn(`[poly:${this.name}] on_open_hook threw`, err);
        }
    }

    private on_message(data: unknown): void {
        if (typeof data !== "string") return;
        if (data === "PONG" || data === "pong") return;
        let parsed: unknown;
        try {
            parsed = JSON.parse(data);
        } catch {
            return;
        }
        // console.log("parsed data is : ", parsed);

        let log_data_1;
        let log_data_2;

        if (typeof parsed === "object" && parsed !== null && "price_changes" in parsed) {
            const priceChanges = (parsed as { price_changes: Array<{ asset_id: string }> })
                .price_changes;
            if (Array.isArray(priceChanges)) {
                log_data_1 = priceChanges[0]?.asset_id;
                log_data_2 = priceChanges[1]?.asset_id;
            }
        }

        console.log("message received from clob client: ", log_data_1);
        console.log("message received from clob client: ", log_data_2);

        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items) {
            this.handle_message(item);
        }
    }

    private on_close(code: number, reason: string): void {
        console.warn(`[poly:${this.name}] closed`, { code, reason });
        this.clear_timers();
        this.ws = null;
        if (this.stopped) {
            this.set_state("closed");
            return;
        }
        this.schedule_reconnect();
    }

    private schedule_reconnect(): void {
        this.set_state("reconnecting");
        const delay = this.reconnect_delay;
        this.reconnect_delay = Math.min(delay * 2, POLY_WS.reconnect_max_ms);
        this.reconnect_timer = setTimeout(() => this.connect(), delay);
    }

    private clear_timers(): void {
        if (this.heartbeat_timer) {
            clearInterval(this.heartbeat_timer);
            this.heartbeat_timer = null;
        }
        if (this.reconnect_timer) {
            clearTimeout(this.reconnect_timer);
            this.reconnect_timer = null;
        }
    }

    private set_state(next: SocketState): void {
        this.state = next;
        void this.publisher.publish_status(this.name, next);
    }
}
