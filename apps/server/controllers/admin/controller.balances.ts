import type { Request, Response } from "express";
import ResponseWriter from "../../services/service.response";
import BalanceMonitorService from "../../services/service.balance-monitor";

export default class BalancesController {
    private static service = new BalanceMonitorService();

    static async process(_req: Request, res: Response) {
        try {
            const snapshot = await BalancesController.service.fetch_all();
            return ResponseWriter.success(res, snapshot, "OK");
        } catch (err) {
            console.error("[admin/balances]", err);
            return ResponseWriter.system_error(res);
        }
    }
}
