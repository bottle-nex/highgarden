import { Router } from "express";
import ListPublicMarketsController from "../../controllers/markets/controller.list-public";
import GetMarketByIdController from "../../controllers/markets/controller.get-by-id";
import GetOrderBookController from "../../controllers/markets/controller.get-orderbook";
import GetPriceHistoryController from "../../controllers/markets/controller.get-price-history";
import GetRecentTradesController from "../../controllers/markets/controller.get-recent-trades";

const markets_router: Router = Router();

markets_router.get("/", ListPublicMarketsController.process);
markets_router.get("/:id", GetMarketByIdController.process);
markets_router.get("/:id/orderbook", GetOrderBookController.process);
markets_router.get("/:id/price-history", GetPriceHistoryController.process);
markets_router.get("/:id/trades", GetRecentTradesController.process);

export default markets_router;
