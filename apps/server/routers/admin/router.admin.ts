import { Router } from "express";
import ListPendingController from "../../controllers/admin/controller.list-pending";
import ListListingsController from "../../controllers/admin/controller.list-listings";
import ListingCountsController from "../../controllers/admin/controller.listing-counts";
import ApproveListingController from "../../controllers/admin/controller.approve";
import ApproveAndListOnSolanaController from "../../controllers/admin/controller.approve-and-list";
import RejectListingController from "../../controllers/admin/controller.reject";
import RunListerController from "../../controllers/admin/controller.run-lister";
import DiagnosticController from "../../controllers/admin/controller.diagnostic";
import TestFundController from "../../controllers/admin/controller.test-fund";
import FundByEmailController from "../../controllers/admin/controller.fund-by-email";
import BalancesController from "../../controllers/admin/controller.balances";
import FastSubscriptionsController from "../../controllers/admin/controller.fast-subscriptions";
import { requireAdmin } from "../../middleware/middleware.admin";
import { requireAuth } from "../../middleware/middleware.auth";
import { rate_limiters as rl } from "../../middleware/middleware.rate-limit";

const admin_router: Router = Router();

admin_router.use(requireAuth, requireAdmin, rl.admin_strict);

admin_router.get("/pending", ListPendingController.process);
admin_router.get("/listings", ListListingsController.process);
admin_router.get("/listings/counts", ListingCountsController.process);
admin_router.get("/diagnostic", DiagnosticController.process);
admin_router.post("/approve/:marketId", ApproveListingController.process);
admin_router.post("/approve-and-list/:marketId", ApproveAndListOnSolanaController.process);
admin_router.post("/reject/:marketId", RejectListingController.process);
admin_router.post("/lister/run", RunListerController.process);
admin_router.post("/test-fund/:userId", TestFundController.process);
admin_router.post("/fund-by-email", FundByEmailController.process);
admin_router.get("/balances", BalancesController.process);

admin_router.get("/fast-subscriptions", FastSubscriptionsController.list);
admin_router.post("/fast-subscriptions", FastSubscriptionsController.create);
admin_router.delete("/fast-subscriptions/:id", FastSubscriptionsController.remove);

export default admin_router;
