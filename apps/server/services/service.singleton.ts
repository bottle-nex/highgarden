import Redis from "ioredis";
import { ENV } from "../config/config.env";
import { autoLister } from "./auto-lister.service";
import { errorHandler } from "../middleware/error-handler";

export default class Services {
    public redis!: Redis;

    public boot() {
        this.redis = new Redis(ENV.SERVER_REDIS_URL);
        errorHandler
    }
}
