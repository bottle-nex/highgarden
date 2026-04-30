import Env from "./config/config.env";
import Services from "./services/service.singleton";

Env.parse_env();
export const services = new Services();
services.boot();

await services.polymarket.start();

const shutdown = async () => {
    await services.polymarket.stop();
    process.exit(0);
};
process.on("SIGTERM", () => shutdown());
process.on("SIGINT", () => shutdown());
