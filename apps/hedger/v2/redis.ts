import type { RedisOptions } from "ioredis";
import { ENV } from "./envs/env";

/**
 * Builds the BullMQ-compatible Redis options object. Used as the
 * `connection` field on BullMQ's `Queue`, `Worker`, and `QueueEvents`
 * — each gets its own underlying socket, BullMQ doesn't share.
 *
 * Why options vs. a constructed instance: passing options lets BullMQ
 * own the connection lifecycle (open / close / reconnect). Passing an
 * instance puts that on us. Options is simpler when we don't need raw
 * Redis access elsewhere — and v2 doesn't.
 *
 * Two non-obvious knobs:
 *
 *   - `maxRetriesPerRequest: null` — required by BullMQ for Worker and
 *     QueueEvents. Without it, brief Redis blips surface as
 *     `MaxRetriesPerRequestError` instead of being transparently
 *     retried, and the worker tears itself down.
 *
 *   - `family: 4` (IPv4) — macOS resolves "localhost" to ::1 (IPv6)
 *     first, and Bun's ioredis path has flaky behavior over IPv6
 *     leading to spurious ETIMEDOUT on connect. Forcing IPv4 makes
 *     resolution deterministic. We also rewrite "localhost" →
 *     "127.0.0.1" as belt-and-suspenders.
 */
export function make_redis_options(): RedisOptions {
  const url = new URL(ENV.HEDGER_REDIS_URL);

  const opts: RedisOptions = {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    family: 4,
    host: normalize_host(url.hostname),
    port: url.port ? Number(url.port) : 6379,
  };
  if (url.password) opts.password = decodeURIComponent(url.password);
  if (url.username) opts.username = decodeURIComponent(url.username);
  if (ENV.HEDGER_REDIS_TLS) opts.tls = {};

  return opts;
}

function normalize_host(hostname: string): string {
  return hostname === "localhost" ? "127.0.0.1" : hostname;
}
