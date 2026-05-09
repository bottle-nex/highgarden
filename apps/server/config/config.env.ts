import { z } from "zod";

const env_schema = z.object({
    SERVER_REDIS_URL: z.string(),
    SERVER_PORT: z.coerce.number(),
    SERVER_AUTH_SECRET: z.string().min(32),
    SERVER_RESEND_API_KEY: z.string(),
    SERVER_OTP_TTL_SECONDS: z.coerce.number().default(600),
    SERVER_OTP_COOLDOWN_SECONDS: z.coerce.number().default(60),
    SERVER_OTP_MAX_ATTEMPTS: z.coerce.number().default(5),
    SERVER_WEB_ORIGIN: z.url(),
    SERVER_POLYMARKET_GAMMA_URL: z.url().default("https://gamma-api.polymarket.com"),
    SERVER_AUTH_TOKEN_TTL: z.string().default("7d"),
    SERVER_KEY_ENCRYPTION_KEY: z
        .string()
        .refine(
            (s) => Buffer.from(s, "base64").length === 32,
            "SERVER_KEY_ENCRYPTION_KEY must be 32 bytes when base64-decoded",
        ),
    SERVER_SOLANA_RPC_URL: z.url().default("https://api.mainnet-beta.solana.com"),
    SERVER_USDC_MINT: z.string().default("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
    SERVER_SOLANA_PROGRAM_ID: z.string().default("2LEm66V2Ys8JbVoQfYbZqCy6YGM1wuPUc843xRx76t3P"),
    SERVER_SOLANA_ADMIN_KEYPAIR: z.string().optional(),
    SERVER_QUOTE_SIGNER_KEYPAIR: z.string().optional(),
    SERVER_QUOTE_EXPIRY_SECONDS: z.coerce.number().default(5),
    SERVER_QUOTE_SPREAD_CENTS: z.coerce.number().default(2),
    SERVER_UNHEDGED_DELTA_CAP_USD: z.coerce.number().default(500),
    SERVER_POLYGON_RPC_URL: z.string().url().default("https://polygon-rpc.com"),
    SERVER_POLYMARKET_FUNDER_ADDRESS: z.string().optional(),

    // Polymarket CLOB credentials. Same shape as the hedger's
    // HEDGER_POLYMARKET_* envs but with SERVER_ prefix so each app reads
    // from its own namespace. Both apps point at the same Polygon wallet.
    SERVER_POLYMARKET_REST_URL: z.string().url().default("https://clob.polymarket.com"),
    SERVER_POLYMARKET_PRIVATE_KEY: z.string().optional(),
    SERVER_POLYMARKET_API_KEY: z.string().optional(),
    SERVER_POLYMARKET_API_SECRET: z.string().optional(),
    SERVER_POLYMARKET_API_PASSPHRASE: z.string().optional(),

    // Hedge-first trade orchestration tunables (PR 2/5).
    SERVER_TRADE_HEDGE_TIMEOUT_MS: z.coerce.number().default(8000),
    SERVER_TRADE_SOLANA_RETRY_ATTEMPTS: z.coerce.number().default(3),
    SERVER_TRADE_SOLANA_RETRY_BACKOFF_MS: z.coerce.number().default(500),
    SERVER_TRADE_IDEMPOTENCY_TTL_SEC: z.coerce.number().default(60),
    /**
     * Feature flag: when "true", POST /api/v1/markets/:id/trade is enabled.
     * Default is "false" so PR 2 lands as a no-op for users; flipping in
     * .env activates the new flow without a redeploy.
     */
    SERVER_TRADE_ENDPOINT_ENABLED: z
        .enum(["true", "false"])
        .default("false")
        .transform((s) => s === "true"),
});
export let ENV: z.infer<typeof env_schema>;

export default class EnvService {
    public static parse_env() {
        const result = env_schema.safeParse(process.env);
        if (!result.success) {
            console.error("[env] failed to parse server environment:", result.error.issues);
            process.exit(1);
        }
        ENV = result.data;
    }
}
