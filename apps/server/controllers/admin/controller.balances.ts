import type { Request, Response } from "express";
import { is_admin_email } from "../../middleware/middleware.admin";
import ResponseWriter from "../../services/service.response";
import BalanceMonitorService from "../../services/service.balance-monitor";

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
