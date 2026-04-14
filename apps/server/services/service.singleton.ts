import Redis from "ioredis";
import { ENV } from "../config/config.env";
import { autoLister } from "./auto-lister.service";

export default class Services {
    public redis!: Redis;

    public boot() {
        this.redis = new Redis(ENV.SERVER_REDIS_URL);
        autoLister.start();
        console.log("[services] auto-lister started");
    }
}
