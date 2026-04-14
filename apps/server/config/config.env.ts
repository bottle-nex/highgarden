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
    POLYMARKET_API_BASE: z.string().default("http://localhost:4000"),
    AUTO_LISTER_INTERVAL_MS: z.coerce.number().default(60_000),
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
