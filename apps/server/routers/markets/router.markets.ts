import { Router } from "express";
import ListPublicMarketsController from "../../controllers/markets/controller.list-public";
import GetMarketByIdController from "../../controllers/markets/controller.get-by-id";
import GetOrderBookController from "../../controllers/markets/controller.get-orderbook";
import GetPriceHistoryController from "../../controllers/markets/controller.get-price-history";
import GetRecentTradesController from "../../controllers/markets/controller.get-recent-trades";
import GetMarketNewsController from "../../controllers/markets/controller.get-news";
import GetRecentNewsController from "../../controllers/markets/controller.get-recent-news";
import GetPolymarketCommentsController from "../../controllers/markets/controller.get-polymarket-comments";
import ListCommentsController from "../../controllers/comments/controller.list-comments";
import CreateCommentController from "../../controllers/comments/controller.create-comment";
import QuoteController from "../../controllers/markets/controller.quote";
import PlaceOrderController from "../../controllers/markets/controller.place-order";
import ClaimController from "../../controllers/markets/controller.claim";
import TradeController from "../../controllers/markets/controller.trade";
import { requireAuth } from "../../middleware/middleware.auth";

const markets_router: Router = Router();

markets_router.get("/", ListPublicMarketsController.process);
// Order matters: "news/recent" must come before "/:id" so it doesn't get
// captured by the dynamic param.
markets_router.get("/news/recent", GetRecentNewsController.process);
markets_router.get("/:id", GetMarketByIdController.process);
markets_router.get("/:id/orderbook", GetOrderBookController.process);
markets_router.get("/:id/price-history", GetPriceHistoryController.process);
markets_router.get("/:id/trades", GetRecentTradesController.process);
markets_router.get("/:id/news", GetMarketNewsController.process);
markets_router.get("/:id/polymarket-comments", GetPolymarketCommentsController.process);
markets_router.get("/:id/comments", ListCommentsController.process);
markets_router.post("/:id/comments", requireAuth, CreateCommentController.process);
markets_router.post("/:id/quote", requireAuth, QuoteController.process);
markets_router.post("/:id/place-order", requireAuth, PlaceOrderController.process);
markets_router.post("/:id/claim", requireAuth, ClaimController.process);
// Hedge-first trade endpoint (PR 2/5). Disabled by default behind the
// SERVER_TRADE_ENDPOINT_ENABLED env var; set to "true" once stable to flip
// the frontend onto this path. Coexists with /quote + /place-order during
// migration; the legacy two-call flow remains functional until PR 5.
markets_router.post("/:id/trade", requireAuth, TradeController.process);

export default markets_router;
