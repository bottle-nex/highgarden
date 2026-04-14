import { Router } from "express";

// controllers
import { MarketsController } from "../controllers/markets/markets.controller";

// services
import { simulator } from "../services/simulator.service";

const router: Router = Router();

const marketsController = new MarketsController(simulator);

// <------------------------- HEALTH-CHECK-ROUTE ------------------------->
router.get("/health", marketsController.health);

// <------------------------- GAMMA-ROUTES ------------------------->
router.get("/gamma/markets", marketsController.listGammaMarkets);

// <------------------------- CLOB-ROUTES ------------------------->
router.get("/clob/book", marketsController.getClobBook);

export default router;
