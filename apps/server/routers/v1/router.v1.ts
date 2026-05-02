import { Router } from "express";
import user_router from "../users/router.user";
import auth_router from "../auth/router.auth";
import admin_router from "../admin/router.admin";
import markets_router from "../markets/router.markets";
import comments_router from "../comments/router.comments";

const v1_router: Router = Router();

v1_router.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});

v1_router.use("/auth", auth_router);
v1_router.use("/users", user_router);
v1_router.use("/admin", admin_router);
v1_router.use("/markets", markets_router);
v1_router.use("/comments", comments_router);

export default v1_router;
