import { z } from "zod";

const env_schema = z.object({
  DATABASE_URL: z.string(),

  HEDGER_REDIS_URL: z.string(),
  // NOTE: z.coerce.boolean() converts ANY non-empty string (including
  // the literal "false") to true. Parse the string explicitly instead.
  HEDGER_REDIS_TLS: z
    .enum(["true", "false"])
    .default("false")
    .transform((s) => s === "true"),

  HEDGER_SOLANA_RPC_URL: z.string().url(),
  HEDGER_SOLANA_RPC_WS_URL: z.string().url(),
  HEDGER_SOLANA_PROGRAM_ID: z.string(),
  HEDGER_SOLANA_COMMITMENT: z.enum(["processed", "confirmed", "finalized"]).default("confirmed"),
  HEDGER_SOLANA_ADMIN_KEYPAIR: z.string().optional(),
  HEDGER_SOLANA_ORACLE_SIGNER_KEYPAIR: z.string().optional(),

  HEDGER_POLYMARKET_REST_URL: z.string().url(),
  HEDGER_POLYMARKET_WS_URL: z.string().url(),
  HEDGER_POLYMARKET_GAMMA_URL: z.string().url(),
  HEDGER_POLYMARKET_PRIVATE_KEY: z.string().optional(),
  HEDGER_POLYMARKET_FUNDER_ADDRESS: z.string().optional(),
  HEDGER_POLYMARKET_API_KEY: z.string().optional(),
  HEDGER_POLYMARKET_API_SECRET: z.string().optional(),
  HEDGER_POLYMARKET_API_PASSPHRASE: z.string().optional(),
  HEDGER_POLYGON_RPC_URL: z.string().url().optional(),

  HEDGER_ADMIN_PORT: z.coerce.number().default(4000),
  HEDGER_HEALTH_PORT: z.coerce.number().default(4001),
  HEDGER_ADMIN_BEARER_TOKEN: z.string().min(16).optional(),

  HEDGER_UNHEDGED_DELTA_CAP_USD: z.coerce.number().default(500),
  HEDGER_JOB_ATTEMPTS: z.coerce.number().default(5),
  HEDGER_JOB_BACKOFF_DELAY_MS: z.coerce.number().default(500),
  HEDGER_WORKER_CONCURRENCY: z.coerce.number().default(5),
  HEDGER_WORKER_RATE_LIMIT_MAX: z.coerce.number().default(30),
  HEDGER_WORKER_RATE_LIMIT_MS: z.coerce.number().default(1000),
  HEDGER_SLIPPAGE_LIMIT_CENTS: z.coerce.number().default(2),
  HEDGER_POLLER_INTERVAL_MS: z.coerce.number().default(10_000),
  HEDGER_RECONCILE_INTERVAL_MS: z.coerce.number().default(60_000),
  HEDGER_RESOLVER_POLL_INTERVAL_MS: z.coerce.number().default(60_000),
  HEDGER_RESOLVER_DISPUTE_WINDOW_HOURS: z.coerce.number().default(48),
  HEDGER_LIVE_LISTENER_RECONNECT_MS: z.coerce.number().default(2000),
  HEDGER_OFFLINE_GRACE_PERIOD_SEC: z.coerce.number().default(120),
  HEDGER_MAX_BACKFILL_SIGNATURES: z.coerce.number().default(1000),
  HEDGER_LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type HedgerEnv = z.infer<typeof env_schema>;

export let ENV: HedgerEnv;

export default class EnvService {
  public static parse_env(): void {
    const result = env_schema.safeParse(process.env);
    if (!result.success) {
      console.error("[hedger:env] failed to parse environment:", result.error.issues);
      process.exit(1);
    }
    ENV = result.data;
  }
}
