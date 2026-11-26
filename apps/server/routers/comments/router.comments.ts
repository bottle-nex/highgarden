import { Router } from "express";
import ReportCommentController from "../../controllers/comments/controller.report-comment";
import DeleteCommentController from "../../controllers/comments/controller.delete-comment";
import { requireAuth } from "../../middleware/middleware.auth";
import { rate_limiters as rl } from "../../middleware/middleware.rate-limit";

const comments_router: Router = Router();

comments_router.post("/:id/report", rl.mutate, requireAuth, ReportCommentController.process);
comments_router.delete("/:id", rl.mutate, requireAuth, DeleteCommentController.process);

export default comments_router;
