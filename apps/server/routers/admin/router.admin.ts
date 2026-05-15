import { Router } from "express";
import ListPendingController from "../../controllers/admin/controller.list-pending";
import ListListingsController from "../../controllers/admin/controller.list-listings";
import ApproveListingController from "../../controllers/admin/controller.approve";
import ApproveAndListOnSolanaController from "../../controllers/admin/controller.approve-and-list";
import RejectListingController from "../../controllers/admin/controller.reject";
import ResolveMarketController from "../../controllers/admin/controller.resolve-market";
import RunListerController from "../../controllers/admin/controller.run-lister";
import DiagnosticController from "../../controllers/admin/controller.diagnostic";
import TestFundController from "../../controllers/admin/controller.test-fund";
import FundByEmailController from "../../controllers/admin/controller.fund-by-email";
import BalancesController from "../../controllers/admin/controller.balances";
import FastSubscriptionsController from "../../controllers/admin/controller.fast-subscriptions";
import { requireAuth } from "../../middleware/middleware.auth";

const admin_router: Router = Router();

admin_router.get("/pending", ListPendingController.process);
admin_router.get("/listings", ListListingsController.process);
admin_router.get("/diagnostic", DiagnosticController.process);
admin_router.post("/approve/:marketId", ApproveListingController.process);
admin_router.post("/approve-and-list/:marketId", ApproveAndListOnSolanaController.process);
admin_router.post("/reject/:marketId", RejectListingController.process);
admin_router.post("/resolve-market/:marketId", requireAuth, ResolveMarketController.process);
admin_router.post("/lister/run", RunListerController.process);
admin_router.post("/test-fund/:userId", requireAuth, TestFundController.process);
admin_router.post("/fund-by-email", requireAuth, FundByEmailController.process);
admin_router.get("/balances", requireAuth, BalancesController.process);

admin_router.get("/fast-subscriptions", FastSubscriptionsController.list);
admin_router.post("/fast-subscriptions", requireAuth, FastSubscriptionsController.create);
admin_router.delete("/fast-subscriptions/:id", requireAuth, FastSubscriptionsController.remove);

export default admin_router;
