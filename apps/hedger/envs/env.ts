import { z } from "zod";

/**
 * Environment schema for the v2 hedger. Knobs are grouped by which phase
 * of the boot graph uses them so it's obvious at a glance which can be
 * omitted while running a partial subset (e.g. an ingester-only smoke).
 *
 * Adding a knob: bring it in alongside the first service that consumes
 * it. An unused env var in this schema is dead code — strip it out.
 */
const schema = z.object({
    // shared infra
    DATABASE_URL: z.string(),
    HEDGER_REDIS_URL: z.string(),
    // z.coerce.boolean turns ANY non-empty string (including "false") into
    // true, so parse the literal "true"/"false" string explicitly.
    HEDGER_REDIS_TLS: z
        .enum(["true", "false"])
        .default("false")
        .transform((s) => s === "true"),
    HEDGER_LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

    // solana RPC + program
    HEDGER_SOLANA_RPC_URL: z.string().url(),
    HEDGER_SOLANA_RPC_WS_URL: z.string().url(),
    HEDGER_SOLANA_PROGRAM_ID: z.string(),
    HEDGER_SOLANA_COMMITMENT: z.enum(["processed", "confirmed", "finalized"]).default("confirmed"),
    HEDGER_SOLANA_ADMIN_KEYPAIR: z.string().optional(),
    HEDGER_SOLANA_ORACLE_SIGNER_KEYPAIR: z.string().optional(),

    // polymarket REST + CLOB + Polygon
    HEDGER_POLYMARKET_REST_URL: z.string().url(),
    HEDGER_POLYMARKET_GAMMA_URL: z.string().url(),
    HEDGER_POLYMARKET_PRIVATE_KEY: z.string().optional(),
    HEDGER_POLYMARKET_FUNDER_ADDRESS: z.string().optional(),
    HEDGER_POLYMARKET_API_KEY: z.string().optional(),
    HEDGER_POLYMARKET_API_SECRET: z.string().optional(),
    HEDGER_POLYMARKET_API_PASSPHRASE: z.string().optional(),
    HEDGER_POLYGON_RPC_URL: z.string().url().optional(),

    // ingester loop tuning
    HEDGER_POLLER_INTERVAL_MS: z.coerce.number().default(10_000),
    HEDGER_LIVE_LISTENER_RECONNECT_MS: z.coerce.number().default(2_000),
    HEDGER_MAX_BACKFILL_SIGNATURES: z.coerce.number().default(1_000),
    /**
     * When `true` (default), the live websocket listener is the primary
     * hedge driver. After PR 2/5's hedge-first orchestration in
     * apps/server lands and is enabled in production, set this to "false":
     * the server will hedge synchronously as part of the trade request, and
     * the hedger's only remaining role on the live path is the catch-up
     * poller acting as a safety net for crashes mid-flow. The poller stays
     * on regardless of this flag.
     */
    HEDGER_LIVE_LISTENER_ENABLED: z
        .enum(["true", "false"])
        .default("true")
        .transform((s) => s === "true"),

    // hedger queue tuning
    HEDGER_JOB_ATTEMPTS: z.coerce.number().default(5),
    HEDGER_JOB_BACKOFF_DELAY_MS: z.coerce.number().default(500),
    HEDGER_WORKER_CONCURRENCY: z.coerce.number().default(5),
    HEDGER_WORKER_RATE_LIMIT_MAX: z.coerce.number().default(30),
    HEDGER_WORKER_RATE_LIMIT_MS: z.coerce.number().default(1_000),
    HEDGER_SLIPPAGE_LIMIT_CENTS: z.coerce.number().default(2),
    HEDGER_UNHEDGED_DELTA_CAP_USD: z.coerce.number().default(500),

    // resolver loop tuning
    HEDGER_RESOLVER_POLL_INTERVAL_MS: z.coerce.number().default(60_000),
    HEDGER_RESOLVER_DISPUTE_WINDOW_HOURS: z.coerce.number().default(48),

    // reconciler loop tuning
    HEDGER_RECONCILE_INTERVAL_MS: z.coerce.number().default(60_000),

    // platform inventory liquidator (PR 4/5)
    /** How often the liquidator scans for stale orphan rows. */
    HEDGER_INVENTORY_LIQUIDATE_INTERVAL_MS: z.coerce.number().default(5 * 60_000),
    /** How long an unconsumed PlatformInventory row may live before
     *  liquidation kicks in. Older rows get a reverse Polymarket order
     *  to unwind the position; the platform eats the spread. */
    HEDGER_INVENTORY_LIQUIDATE_AFTER_HOURS: z.coerce.number().default(1),
    /** Hard cap on shares per liquidation tick — prevents one giant orphan
     *  from monopolising the rate-limited Polymarket connection. */
    HEDGER_INVENTORY_LIQUIDATE_MAX_SHARES_PER_TICK: z.coerce.number().default(1_000),

    // health + admin endpoints
    HEDGER_HEALTH_PORT: z.coerce.number().default(4001),
    HEDGER_OFFLINE_GRACE_PERIOD_SEC: z.coerce.number().default(120),
    HEDGER_ADMIN_PORT: z.coerce.number().default(4000),
    HEDGER_ADMIN_BEARER_TOKEN: z.string().min(16).optional(),
});

/**
 * Parsed and frozen environment. Validation runs exactly once at module
 * load — any consumer importing `ENV` is guaranteed to see a valid
 * config. On invalid input zod throws with a structured error and the
 * process exits non-zero before any service constructs.
 */
export const ENV = schema.parse(process.env);
export type Env = typeof ENV;
