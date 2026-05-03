import { Router } from "express";
import ListPendingController from "../../controllers/admin/controller.list-pending";
import ListListingsController from "../../controllers/admin/controller.list-listings";
import ApproveListingController from "../../controllers/admin/controller.approve";
import ApproveAndListOnSolanaController from "../../controllers/admin/controller.approve-and-list";
import RejectListingController from "../../controllers/admin/controller.reject";
import RunListerController from "../../controllers/admin/controller.run-lister";
import DiagnosticController from "../../controllers/admin/controller.diagnostic";
import TestFundController from "../../controllers/admin/controller.test-fund";
import { requireAuth } from "../../middleware/middleware.auth";

const admin_router: Router = Router();

admin_router.get("/pending", ListPendingController.process);
admin_router.get("/listings", ListListingsController.process);
admin_router.get("/diagnostic", DiagnosticController.process);
admin_router.post("/approve/:marketId", ApproveListingController.process);
admin_router.post(
    "/approve-and-list/:marketId",
    ApproveAndListOnSolanaController.process,
);
admin_router.post("/reject/:marketId", RejectListingController.process);
admin_router.post("/lister/run", RunListerController.process);
admin_router.post("/test-fund/:userId", requireAuth, TestFundController.process);

export default admin_router;
