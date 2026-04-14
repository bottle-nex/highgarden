import type { ErrorRequestHandler } from "express";
import ResponseWriter from "../services/service.response";

export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
    console.error("[error]", err);
    if (res.headersSent) {
        return next(err);
    }
    const status = typeof err?.status === "number" ? err.status : 500;
    ResponseWriter.error(
        res,
        err?.code ?? "INTERNAL_ERROR",
        err?.message ?? "Internal Server Error",
        err?.details,
        status,
    );
};
