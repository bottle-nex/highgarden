import type { Server } from "http";
import { simulator } from "./simulator.service";
import { wsGateway } from "./ws-gateway.service";
import { logger } from "../utils/logger";

function init_services(server: Server): void {
    simulator.start();
    logger.info("book simulator started");

    wsGateway.attach(server, "/ws");
    logger.info("ws gateway attached at /ws");
}

export default init_services;
