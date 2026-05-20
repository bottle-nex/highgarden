import { ipKeyGenerator, rateLimit, type Options } from "express-rate-limit";
import type { Request, Response } from "express";
import ResponseWriter from "../services/service.response";

// In-memory store only. Fine for a single-instance deploy. When we
// horizontally scale, swap each limiter's `store` for a RedisStore
// (rate-limit-redis) backed by services.redis.
//
// Limits are intentionally tiered, not global. A single cap would
// either let auth brute-force through or block the UI's market-read
// polling. Tune via the BUCKETS table below; restart picks up changes.

type BucketName =
    | "auth_strict"
    | "auth_burst"
    | "trade"
    | "withdraw"
    | "read"
    | "mutate"
    | "admin_strict"
    | "global";

interface BucketConfig {
    windowMs: number;
    max: number;
    key_by: "ip" | "user_or_ip" | "ip_plus_email";
}

const BUCKETS: Record<BucketName, BucketConfig> = {
    auth_strict: { windowMs: 60_000, max: 5, key_by: "ip_plus_email" },
    auth_burst: { windowMs: 3_600_000, max: 20, key_by: "ip" },
    trade: { windowMs: 60_000, max: 30, key_by: "user_or_ip" },
    withdraw: { windowMs: 3_600_000, max: 5, key_by: "user_or_ip" },
    read: { windowMs: 60_000, max: 300, key_by: "ip" },
    mutate: { windowMs: 60_000, max: 60, key_by: "user_or_ip" },
    admin_strict: { windowMs: 60_000, max: 10, key_by: "ip" },
    global: { windowMs: 60_000, max: 600, key_by: "ip" },
};

function build_key_generator(mode: BucketConfig["key_by"]) {
    return (req: Request): string => {
        if (mode === "user_or_ip") {
            const uid = req.user?.id;
            if (uid) return `u:${uid}`;
            return `ip:${ipKeyGenerator(req.ip ?? "")}`;
        }
        if (mode === "ip_plus_email") {
            const raw = (req.body as { email?: unknown } | undefined)?.email;
            const email = typeof raw === "string" ? raw.toLowerCase().trim() : "";
            return `ipe:${ipKeyGenerator(req.ip ?? "")}:${email}`;
        }
        return `ip:${ipKeyGenerator(req.ip ?? "")}`;
    };
}

function make_limiter(name: BucketName) {
    const cfg = BUCKETS[name];
    return rateLimit({
        windowMs: cfg.windowMs,
        limit: cfg.max,
        standardHeaders: "draft-7",
        legacyHeaders: false,
        keyGenerator: build_key_generator(cfg.key_by),
        handler: (req: Request, res: Response) => {
            const reset = res.getHeader("RateLimit-Reset");
            const retry_after = typeof reset === "string" ? Number(reset) : undefined;
            ResponseWriter.too_many_requests(
                res,
                "Rate limit exceeded. Please slow down.",
                retry_after,
            );
        },
    } satisfies Partial<Options>);
}

export const rate_limiters = {
    auth_strict: make_limiter("auth_strict"),
    auth_burst: make_limiter("auth_burst"),
    trade: make_limiter("trade"),
    withdraw: make_limiter("withdraw"),
    read: make_limiter("read"),
    mutate: make_limiter("mutate"),
    admin_strict: make_limiter("admin_strict"),
    global: make_limiter("global"),
};
