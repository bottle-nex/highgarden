import Redis from "ioredis";
import { ENV } from "../config/config.env";
import PolymarketService from "./service.polymarket";

export default class Services {
    public redis!: Redis;
    public polymarket!: PolymarketService;

    public boot() {
        this.redis = new Redis(ENV.SERVER_REDIS_URL);
        this.polymarket = new PolymarketService(this.redis, async () => {
            // TODO: query prisma for active polymarket condition ids once the
            // hedging bot needs them.
            return [];
        });
    }
}
