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
    SERVER_SOLANA_PROGRAM_ID: z
        .string()
        .default("2LEm66V2Ys8JbVoQfYbZqCy6YGM1wuPUc843xRx76t3P"),
    SERVER_SOLANA_ADMIN_KEYPAIR: z.string().optional(),
    SERVER_QUOTE_SIGNER_KEYPAIR: z.string().optional(),
    SERVER_QUOTE_EXPIRY_SECONDS: z.coerce.number().default(5),
    SERVER_QUOTE_SPREAD_CENTS: z.coerce.number().default(1),
    SERVER_UNHEDGED_DELTA_CAP_USD: z.coerce.number().default(500),
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
