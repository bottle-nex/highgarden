import { Router } from "express";
import user_router from "../users/router.user";
import auth_router from "../auth/router.auth";
import admin_router from "../admin/router.admin";
import markets_router from "../markets/router.markets";
import comments_router from "../comments/router.comments";
import bookmarks_router from "../bookmarks/router.bookmarks";
import { rate_limiters } from "../../middleware/middleware.rate-limit";

const v1_router: Router = Router();

// Health stays exempt from rate limiting so load-balancer probes don't
// burn the global bucket.
v1_router.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});

// Catch-all safety net under every API route below. Per-route tiers
// (auth_strict, trade, withdraw, etc.) are applied inside each sub-router.
v1_router.use(rate_limiters.global);

v1_router.use("/auth", auth_router);
v1_router.use("/users", user_router);
v1_router.use("/admin", admin_router);
v1_router.use("/markets", markets_router);
v1_router.use("/comments", comments_router);
v1_router.use("/bookmarks", bookmarks_router);

export default v1_router;
