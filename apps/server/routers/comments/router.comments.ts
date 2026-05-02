import { Router } from "express";
import ReportCommentController from "../../controllers/comments/controller.report-comment";
import { requireAuth } from "../../middleware/middleware.auth";

const comments_router: Router = Router();

comments_router.post("/:id/report", requireAuth, ReportCommentController.process);

export default comments_router;
