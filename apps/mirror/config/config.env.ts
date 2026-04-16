import { z } from "zod";

const env_schema = z.object({
    SERVER_REDIS_URL: z.string(),
    SERVER_POLYMARKET_API_KEY: z.string().default(""),
    SERVER_POLYMARKET_SECRET: z.string().default(""),
    SERVER_POLYMARKET_PASSPHRASE: z.string().default(""),
    SERVER_POLYMARKET_WS_URL: z.url().default("wss://ws-subscriptions-clob.polymarket.com/ws/"),
});

export let ENV: z.infer<typeof env_schema>;

export default class EnvService {
    public static parse_env() {
        const result = env_schema.safeParse(process.env);
        if (!result.success) {
            console.error("[env] failed to parse mirror environment:", result.error.issues);
            process.exit(1);
        }
        ENV = result.data;
    }
}
