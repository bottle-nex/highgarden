import type { Request, Response } from "express";
import ResponseWriter from "../../services/service.response";
import BalanceMonitorService from "../../services/service.balance-monitor";

function is_admin_email(email: string | null | undefined): boolean {
    if (!email) return false;
    const raw = process.env.ADMIN_EMAILS ?? "";
    if (!raw.trim()) return false;
    const allow = raw
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
    return allow.includes(email.toLowerCase());
}

export default class BalancesController {
    private static service = new BalanceMonitorService();

    static async process(req: Request, res: Response) {
        if (!req.user) return ResponseWriter.not_authorized(res);
        if (!is_admin_email(req.user.email)) {
            return ResponseWriter.not_authorized(res, "admin only");
        }
        try {
            const snapshot = await BalancesController.service.fetch_all();
            return ResponseWriter.success(res, snapshot, "OK");
        } catch (err) {
            console.error("[admin/balances]", err);
            return ResponseWriter.system_error(res);
        }
    }
}
