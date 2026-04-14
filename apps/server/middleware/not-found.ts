import type { RequestHandler } from "express";
import ResponseWriter from "../services/service.response";

export const notFoundHandler: RequestHandler = (req, res) => {
  ResponseWriter.not_found(res, `Route not found: ${req.originalUrl}`);
};
