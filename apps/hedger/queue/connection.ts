import IORedis, { type Redis, type RedisOptions } from "ioredis";
import { ENV } from "../config/env";

export default class RedisConnectionFactory {
    private static shared: Redis | null = null;

    public static get_options(): RedisOptions {
        const opts: RedisOptions = {
            maxRetriesPerRequest: null,
            enableReadyCheck: true,
        };

        const url = new URL(ENV.HEDGER_REDIS_URL);
        opts.host = url.hostname;
        opts.port = url.port ? Number(url.port) : 6379;
        if (url.password) opts.password = decodeURIComponent(url.password);
        if (url.username) opts.username = decodeURIComponent(url.username);
        if (ENV.HEDGER_REDIS_TLS) opts.tls = {};

        return opts;
    }

    public static get_shared(): Redis {
        if (!this.shared) {
            this.shared = new IORedis(this.get_options());
        }
        return this.shared;
    }

    public static async disconnect(): Promise<void> {
        if (this.shared) {
            await this.shared.quit().catch(() => {});
            this.shared = null;
        }
    }
}
