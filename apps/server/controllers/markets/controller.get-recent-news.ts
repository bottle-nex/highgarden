import type { Request, Response } from "express";
import ResponseWriter from "../../services/service.response";
import { services } from "../../index";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export default class GetRecentNewsController {
    static async process(req: Request, res: Response) {
        const raw = Number(req.query.limit);
        const limit =
            Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), MAX_LIMIT) : DEFAULT_LIMIT;

        try {
            const articles = await services.news.recent_across_approved(limit);
            return ResponseWriter.success(res, articles, "Recent news");
        } catch (err) {
            console.error("[markets/get-recent-news]", err);
            return ResponseWriter.system_error(res);
        }
    }
}
