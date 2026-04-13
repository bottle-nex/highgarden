import { Router } from "express";
import user_router from "../users/router.user";
import auth_router from "../auth/router.auth";
import admin_router from "../admin/router.admin";

const v1_router: Router = Router();

v1_router.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

v1_router.use("/auth", auth_router);
v1_router.use("/users", user_router);
v1_router.use("/admin", admin_router);

export default v1_router;
