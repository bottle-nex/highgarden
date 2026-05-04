import IORedis, { type Redis, type RedisOptions } from "ioredis";
import { ENV } from "../config/env";

export default class RedisConnectionFactory {
  private static shared: Redis | null = null;

  public static get_options(): RedisOptions {
    const opts: RedisOptions = {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      // Force IPv4. macOS resolves "localhost" to ::1 first, and Bun's
      // ioredis path has flaky behavior over IPv6 — leads to spurious
      // ETIMEDOUT on connect. Setting family=4 makes resolution
      // deterministic for both "localhost" and explicit hostnames.
      family: 4,
    };

    const url = new URL(ENV.HEDGER_REDIS_URL);
    opts.host = this.normalize_host(url.hostname);
    opts.port = url.port ? Number(url.port) : 6379;
    if (url.password) opts.password = decodeURIComponent(url.password);
    if (url.username) opts.username = decodeURIComponent(url.username);
    if (ENV.HEDGER_REDIS_TLS) opts.tls = {};

    return opts;
  }

  private static normalize_host(hostname: string): string {
    // Belt-and-suspenders: even with family=4, some Bun + ioredis paths
    // do their own resolution. Rewriting "localhost" → "127.0.0.1"
    // sidesteps anything ambiguous.
    return hostname === "localhost" ? "127.0.0.1" : hostname;
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
