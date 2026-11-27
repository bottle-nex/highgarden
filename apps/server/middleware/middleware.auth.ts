import type { NextFunction, Request, Response } from "express";
import ResponseWriter from "../services/service.response";
import { verifySessionJwt } from "../services/service.jwt";

export function optionalAuth(req: Request, res: Response, next: NextFunction) {
    if (!req.headers.authorization) return next();
    return requireAuth(req, res, next);
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
        return ResponseWriter.not_authorized(res, "Missing bearer token");
    }

    const token = header.slice("Bearer ".length).trim();
    if (!token) {
        return ResponseWriter.not_authorized(res, "Empty bearer token");
    }

    try {
        const claims = verifySessionJwt(token);
        req.user = { id: claims.sub, email: claims.email };
        next();
    } catch {
        return ResponseWriter.not_authorized(res, "Invalid or expired token");
    }
}
