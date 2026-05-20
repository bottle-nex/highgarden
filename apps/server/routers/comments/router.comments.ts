import { Router } from "express";
import ReportCommentController from "../../controllers/comments/controller.report-comment";
import { requireAuth } from "../../middleware/middleware.auth";
import { rate_limiters as rl } from "../../middleware/middleware.rate-limit";

const comments_router: Router = Router();

comments_router.post("/:id/report", rl.mutate, requireAuth, ReportCommentController.process);

export default comments_router;
