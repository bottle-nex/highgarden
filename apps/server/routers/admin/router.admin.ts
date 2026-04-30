import { Router } from "express";
import ListPendingController from "../../controllers/admin/controller.list-pending";
import ListListingsController from "../../controllers/admin/controller.list-listings";
import ApproveListingController from "../../controllers/admin/controller.approve";
import RejectListingController from "../../controllers/admin/controller.reject";
import RunListerController from "../../controllers/admin/controller.run-lister";
import DiagnosticController from "../../controllers/admin/controller.diagnostic";

const admin_router: Router = Router();

admin_router.get("/pending", ListPendingController.process);
admin_router.get("/listings", ListListingsController.process);
admin_router.get("/diagnostic", DiagnosticController.process);
admin_router.post("/approve/:marketId", ApproveListingController.process);
admin_router.post("/reject/:marketId", RejectListingController.process);
admin_router.post("/lister/run", RunListerController.process);

export default admin_router;
