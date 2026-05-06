import { ENV } from "../config/env";
import LoggerFactory from "../log/logger";
import AdminAuth from "./auth";
import AdminHandlers, { type AdminDeps } from "./handlers";

export default class HedgerAdminServer {
  private readonly log = LoggerFactory.for_category("admin-server");
  private readonly handlers: AdminHandlers;
  private server: ReturnType<typeof Bun.serve> | null = null;

  constructor(deps: AdminDeps) {
    this.handlers = new AdminHandlers(deps);
  }

  public start(): void {
    if (!AdminAuth.is_configured()) {
      this.log.warn(
        "HEDGER_ADMIN_BEARER_TOKEN not set — admin server disabled. Set it (≥ 16 chars) to enable.",
      );
      return;
    }
    this.server = Bun.serve({
      port: ENV.HEDGER_ADMIN_PORT,
      fetch: (req) => this.dispatch(req),
    });
    this.log.info({ port: ENV.HEDGER_ADMIN_PORT }, "admin server listening");
  }

  public async stop(): Promise<void> {
    await this.server?.stop();
    this.server = null;
  }

  private async dispatch(req: Request): Promise<Response> {
    if (!AdminAuth.verify(req)) return AdminAuth.unauthorized_response();
    try {
      return await this.route(req);
    } catch (err) {
      this.log.error({ err }, "admin handler threw");
      return Response.json(
        { ok: false, error: "INTERNAL", message: (err as Error)?.message },
        { status: 500 },
      );
    }
  }

  private async route(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/$/, "");

    if (path === "/admin/status" && req.method === "GET") {
      return this.handlers.status();
    }
    if (path === "/admin/resolver" && req.method === "GET") {
      return this.handlers.list_resolver();
    }
    if (path === "/admin/exposure" && req.method === "GET") {
      return this.handlers.list_exposure();
    }

    const force_solana = path.match(/^\/admin\/resolver\/([^/]+)\/force-solana-resolve$/);
    if (force_solana && req.method === "POST") {
      return this.handlers.force_solana_resolve(force_solana[1]!);
    }
    const retry_redeem = path.match(/^\/admin\/resolver\/([^/]+)\/retry-redeem$/);
    if (retry_redeem && req.method === "POST") {
      return this.handlers.retry_redeem(retry_redeem[1]!);
    }
    const patch_exposure = path.match(/^\/admin\/exposure\/([^/]+)$/);
    if (patch_exposure && req.method === "PATCH") {
      const body = await this.parse_body(req);
      return this.handlers.patch_exposure(patch_exposure[1]!, body);
    }
    const retry_hedge = path.match(/^\/admin\/hedges\/([^/]+)\/retry$/);
    if (retry_hedge && req.method === "POST") {
      return this.handlers.retry_hedge(retry_hedge[1]!);
    }

    return Response.json({ ok: false, error: "NOT_FOUND", path }, { status: 404 });
  }

  private async parse_body(req: Request): Promise<unknown> {
    if (req.method === "GET" || req.method === "HEAD") return undefined;
    const text = await req.text();
    if (!text.trim()) return {};
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
}
