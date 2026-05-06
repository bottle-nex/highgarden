import { ENV } from "../config/env";

export default class AdminAuth {
    public static is_configured(): boolean {
        return !!ENV.HEDGER_ADMIN_BEARER_TOKEN;
    }

    public static verify(req: Request): boolean {
        if (!ENV.HEDGER_ADMIN_BEARER_TOKEN) return false;
        const header = req.headers.get("authorization") ?? "";
        if (!header.toLowerCase().startsWith("bearer ")) return false;
        const provided = header.slice(7).trim();
        return provided === ENV.HEDGER_ADMIN_BEARER_TOKEN;
    }

    public static unauthorized_response(): Response {
        return Response.json(
            { ok: false, error: "NOT_AUTHORIZED" },
            { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
        );
    }
}
