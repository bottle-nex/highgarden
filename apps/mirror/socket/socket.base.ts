import { WebSocket } from "ws";
import type { SocketState } from "@solmarket/polymarket-contracts";
import { POLY_WS } from "../config/config.polymarket";
import type PolymarketPublisher from "../services/service.polymarket.publisher";

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

    constructor(name: "market" | "user", publisher: PolymarketPublisher) {
        this.name = name;
        this.publisher = publisher;
    }

    protected abstract get_url(): string;
    protected abstract get_subscribe_frame(): object | null;
    // eslint-disable-next-line no-unused-vars
    protected abstract handle_message(msg: unknown): void;

    public async connect(): Promise<void> {
        if (this.state === "open" || this.state === "connecting") return;
        this.stopped = false;
        this.set_state("connecting");

        try {
            this.ws = new WebSocket(this.get_url());
        } catch (err) {
            console.error(`[poly:${this.name}] ctor failed`, err);
            this.schedule_reconnect();
            return;
        }

        this.ws.on("open", () => this.on_open());
        this.ws.on("message", (data) => this.on_message(data.toString()));
        this.ws.on("close", (code, reason) => this.on_close(code, reason.toString()));
        this.ws.on("error", (err) => {
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
        this.set_state("open");
        this.reconnect_delay = POLY_WS.reconnect_initial_ms;

        const frame = this.get_subscribe_frame();
        if (frame) {
            this.ws!.send(JSON.stringify(frame));
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

        if (Array.isArray(parsed)) {
            for (const item of parsed) this.handle_message(item);
        } else {
            this.handle_message(parsed);
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
