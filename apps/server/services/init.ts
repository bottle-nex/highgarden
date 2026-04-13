import { autoLister } from "./auto-lister.service";
import { logger } from "../utils/logger";

function init_services(): void {
    autoLister.start();
    logger.info("auto-lister started");
}

export default init_services;
