import { ENV } from "../config/env";
import LoggerFactory from "../log/logger";

export interface HealthSnapshot {
  started_at: number;
  last_event_at: number | null;
  live_listener_connected: boolean;
}

export default class HealthServer {
  private readonly log = LoggerFactory.for_category("health");
  private readonly snapshot: HealthSnapshot;
  private server: ReturnType<typeof Bun.serve> | null = null;

  constructor() {
    this.snapshot = {
      started_at: Date.now(),
      last_event_at: null,
      live_listener_connected: false,
    };
  }

  public start(): void {
    this.server = Bun.serve({
      port: ENV.HEDGER_HEALTH_PORT,
      fetch: (req) => this.handle_request(req),
    });
    this.log.info({ port: ENV.HEDGER_HEALTH_PORT }, "health server listening");
  }

  public async stop(): Promise<void> {
    await this.server?.stop();
    this.server = null;
  }

  public mark_live_connected(connected: boolean): void {
    this.snapshot.live_listener_connected = connected;
  }

  public mark_event_seen(): void {
    this.snapshot.last_event_at = Date.now();
  }

  private handle_request(req: Request): Response {
    const url = new URL(req.url);
    if (url.pathname === "/healthz") return this.respond_healthz();
    if (url.pathname === "/readyz") return this.respond_readyz();
    return new Response("not found", { status: 404 });
  }

  private respond_healthz(): Response {
    return Response.json({ ok: true, ...this.snapshot });
  }

  private respond_readyz(): Response {
    const ready = this.snapshot.live_listener_connected;
    return Response.json({ ready, ...this.snapshot }, { status: ready ? 200 : 503 });
  }
}
