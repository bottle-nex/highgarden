import type { Request, Response } from "express";
import { autoLister } from "../../services/auto-lister.service";
import ResponseWriter from "../../services/service.response";

export default class RunListerController {
    static async process(_req: Request, res: Response) {
        try {
            const result = await autoLister.runOnce();
            return ResponseWriter.success(res, result, "Auto-lister run complete");
        } catch (err) {
            console.error("[admin/run-lister]", err);
            return ResponseWriter.system_error(res);
        }
    }
}
