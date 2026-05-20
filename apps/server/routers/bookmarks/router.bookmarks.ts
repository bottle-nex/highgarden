import { Router } from "express";
import { requireAuth } from "../../middleware/middleware.auth";
import { rate_limiters as rl } from "../../middleware/middleware.rate-limit";
import ListBookmarksController from "../../controllers/bookmarks/controller.list-bookmarks";
import ListBookmarkIdsController from "../../controllers/bookmarks/controller.list-bookmark-ids";
import AddBookmarkController from "../../controllers/bookmarks/controller.add-bookmark";
import RemoveBookmarkController from "../../controllers/bookmarks/controller.remove-bookmark";

const bookmarks_router: Router = Router();

bookmarks_router.get("/", rl.read, requireAuth, ListBookmarksController.process);
bookmarks_router.get("/ids", rl.read, requireAuth, ListBookmarkIdsController.process);
bookmarks_router.post("/:id", rl.mutate, requireAuth, AddBookmarkController.process);
bookmarks_router.delete("/:id", rl.mutate, requireAuth, RemoveBookmarkController.process);

export default bookmarks_router;
