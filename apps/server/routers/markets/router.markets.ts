import { Router } from "express";
import ListPublicMarketsController from "../../controllers/markets/controller.list-public";
import GetMarketByIdController from "../../controllers/markets/controller.get-by-id";

const markets_router: Router = Router();

markets_router.get("/", ListPublicMarketsController.process);
markets_router.get("/:id", GetMarketByIdController.process);

export default markets_router;
