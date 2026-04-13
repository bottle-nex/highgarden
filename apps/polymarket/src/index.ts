import express from "express";
import http from "http";
import cors from "cors";
import env from "./config/config.env";
import router from "./routes";
import init_services from "./services/init";
import { simulator } from "./services/simulator.service";
import { wsGateway } from "./services/ws-gateway.service";
import { logger } from "./utils/logger";

const app = express();

app.set("trust proxy", true);

const server = http.createServer(app);

app.use(express.json());

app.use(
    cors({
        origin: "*",
        credentials: true,
    }),
);

app.use("/", router);

init_services(server);

server.listen(env.POLYMARKET_MOCK_PORT, () => {
    logger.info(`polymarket is running on port ${env.POLYMARKET_MOCK_PORT}`);
});

process.on("SIGINT", () => {
    logger.info("shutting down mock polymarket gracefully...");
    simulator.stop();
    wsGateway.close();
    server.close(() => {
        logger.info("mock polymarket closed");
        process.exit(0);
    });
});
