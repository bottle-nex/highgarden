import { Router } from "express";

const user_router: Router = Router();

user_router.get("/me", (_req, res) => {
    res.status(501).json({ error: "not_implemented" });
});

export default user_router;
