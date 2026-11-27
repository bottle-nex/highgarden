import type { NextFunction, Request, Response } from "express";
import ResponseWriter from "../services/service.response";

export function is_admin_email(email: string | null | undefined): boolean {
    if (!email) return false;
    const raw = process.env.ADMIN_EMAILS ?? "";
    if (!raw.trim()) return false;
    const allow = raw
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean);
    return allow.includes(email.toLowerCase());
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
    if (!req.user) return ResponseWriter.not_authorized(res);
    if (!is_admin_email(req.user.email)) {
        return ResponseWriter.error(res, "ADMIN_REQUIRED", "Admin access required", undefined, 403);
    }
    next();
}
