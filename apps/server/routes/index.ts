import { Router, type Request, type Response } from "express";

// controllers
import { AdminController } from "../controllers/admin/admin.controller";

// services
import { autoLister } from "../services/auto-lister.service";

const router: Router = Router();

const adminController = new AdminController(autoLister);

// <------------------------- HEALTH-CHECK-ROUTE ------------------------->
router.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
});

// <------------------------- ADMIN-ROUTES ------------------------->
router.get("/admin/pending", adminController.listPending);
router.get("/admin/listings", adminController.listListings);
router.post("/admin/approve/:marketId", adminController.approve);
router.post("/admin/reject/:marketId", adminController.reject);
router.post("/admin/lister/run", adminController.runLister);

export default router;
