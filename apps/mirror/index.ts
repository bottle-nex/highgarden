import Env from "./config/config.env";
import Services from "./services/service.singleton";

Env.parse_env();
export const services = new Services();
services.boot();

await services.polymarket.start();
console.log("[mirror] up");

const shutdown = async (signal: string) => {
    console.log(`[mirror] ${signal} received, stopping`);
    await services.polymarket.stop();
    process.exit(0);
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
