import type { Request, Response, NextFunction } from "express";
import { ENV } from "../config/config.env";
import ResponseWriter from "../services/service.response";

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
    if (!req.user) return ResponseWriter.not_authorized(res);
    const owners = ENV.ADMIN_EMAILS.split(",")
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean);
    if (!owners.includes(req.user.email.trim().toLowerCase())) {
        return ResponseWriter.error(res, "FORBIDDEN", "Owner access required", undefined, 403);
    }
    next();
}
