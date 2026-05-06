import { ENV } from "./envs/env";
import { logger_for } from "./log/log";

type BunServer = ReturnType<typeof Bun.serve>;

/**
 * Tiny HTTP server exposing `/healthz` for the orchestrator to probe.
 * Holds two pieces of in-memory state:
 *
 *   - `last_event_ms`: when the listener last observed a fill. If older
 *     than `HEDGER_OFFLINE_GRACE_PERIOD_SEC`, we consider the chain
 *     "quiet" — paired with `live_connected` it tells the orchestrator
 *     whether silence is expected (live but quiet) or not (disconnected).
 *
 *   - `live_connected`: whether the websocket subscription is currently
 *     up. Set true on subscribe success, false on teardown / pending
 *     reconnect.
 *
 * `/healthz` returns 200 only when both are healthy; 503 otherwise.
 * Anything else returns 404.
 *
 * Construction is sync and side-effect free; the actual `Bun.serve`
 * call happens in `start()` so init order in `init.services.ts` stays
 * "build everything, then wire and start."
 */
export default class HealthServer {
    private readonly log = logger_for("health");
    private last_event_ms = Date.now();
    private live_connected = false;
    private server: BunServer | null = null;

    /**
     * Records that an `OrderFilled` event was observed. Called from the
     * listener and the poller (any path that produces a fill). The
     * `/healthz` endpoint reports unhealthy if no event has been seen
     * within the configured grace period — that's the signal the chain
     * has gone quiet *or* our subscription has silently died.
     */
    public mark_event(): void {
        this.last_event_ms = Date.now();
    }

    /**
     * Records the websocket connection state. Set true on subscribe
     * success, false on subscription teardown / reconnect-pending.
     * Combined with the event-staleness check, this distinguishes "chain
     * is quiet" (live=true, stale=true) from "we're disconnected"
     * (live=false).
     */
    public mark_live(state: boolean): void {
        this.live_connected = state;
    }

    /**
     * Binds `Bun.serve` to the configured port and starts answering
     * `/healthz`. 200 when the websocket is connected and a recent event
     * has been observed; 503 otherwise. Idempotent — calling start twice
     * is a no-op.
     */
    public start(): void {
        if (this.server) return;
        const grace_ms = ENV.HEDGER_OFFLINE_GRACE_PERIOD_SEC * 1000;
        this.server = Bun.serve({
            port: ENV.HEDGER_HEALTH_PORT,
            fetch: (req) => {
                if (new URL(req.url).pathname !== "/healthz") {
                    return new Response("not found", { status: 404 });
                }
                const stale = Date.now() - this.last_event_ms > grace_ms;
                const ok = this.live_connected && !stale;
                return new Response(
                    JSON.stringify({ ok, live_connected: this.live_connected, stale }),
                    {
                        status: ok ? 200 : 503,
                        headers: { "content-type": "application/json" },
                    },
                );
            },
        });
        this.log.info({ port: ENV.HEDGER_HEALTH_PORT }, "health server up");
    }

    public async stop(): Promise<void> {
        this.server?.stop();
        this.server = null;
    }
}
