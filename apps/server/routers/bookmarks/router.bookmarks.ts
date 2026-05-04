import { Router } from "express";
import { requireAuth } from "../../middleware/middleware.auth";
import ListBookmarksController from "../../controllers/bookmarks/controller.list-bookmarks";
import ListBookmarkIdsController from "../../controllers/bookmarks/controller.list-bookmark-ids";
import AddBookmarkController from "../../controllers/bookmarks/controller.add-bookmark";
import RemoveBookmarkController from "../../controllers/bookmarks/controller.remove-bookmark";

const bookmarks_router: Router = Router();

bookmarks_router.get("/", requireAuth, ListBookmarksController.process);
bookmarks_router.get("/ids", requireAuth, ListBookmarkIdsController.process);
bookmarks_router.post("/:id", requireAuth, AddBookmarkController.process);
bookmarks_router.delete("/:id", requireAuth, RemoveBookmarkController.process);

export default bookmarks_router;
