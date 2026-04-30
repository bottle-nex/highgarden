import Redis from "ioredis";
import { ENV } from "../config/config.env";
import { REDIS_CHANNELS, type TokenIndexEntry } from "@solmarket/polymarket-contracts";

const SHORT_LEN = 8;

/**
 * Read-only mirror-side cache of the token→market index that the server
 * publishes. Refreshes on boot and on the change pubsub. Used purely to
 * enrich logs with marketId/name; never on the data hot path.
 */
export default class TokenIndex {
    private readonly cmd: Redis;
    private sub: Redis | null = null;
    private cache = new Map<string, TokenIndexEntry>();

    constructor(cmd: Redis) {
        this.cmd = cmd;
    }

    public async start(): Promise<void> {
        await this.refresh();
        this.sub = new Redis(ENV.SERVER_REDIS_URL);
        await this.sub.subscribe(REDIS_CHANNELS.token_index_changed);
        this.sub.on("message", () => {
            void this.refresh();
        });
    }

    public async stop(): Promise<void> {
        await this.sub?.quit();
        this.sub = null;
    }

    public async refresh(): Promise<void> {
        try {
            const raw = await this.cmd.hgetall(REDIS_CHANNELS.token_index);
            const next = new Map<string, TokenIndexEntry>();
            for (const [token_id, json] of Object.entries(raw)) {
                const parsed = this.parse(json);
                if (parsed) next.set(token_id, parsed);
            }
            this.cache = next;
        } catch (err) {
            console.warn("[token-index] refresh failed", err);
        }
    }

    public get(token_id: string | undefined | null): TokenIndexEntry | null {
        if (!token_id) return null;
        return this.cache.get(token_id) ?? null;
    }

    public label(token_id: string | undefined | null): string {
        if (!token_id) return "?";
        const short = trunc(token_id);
        const entry = this.cache.get(token_id);
        if (!entry) return short;
        return `${short} ${entry.marketId}/${entry.outcome}`;
    }

    private parse(json: string): TokenIndexEntry | null {
        try {
            const obj = JSON.parse(json) as Partial<TokenIndexEntry>;
            if (typeof obj?.marketId !== "string") return null;
            if (typeof obj.marketName !== "string") return null;
            if (obj.outcome !== "YES" && obj.outcome !== "NO") return null;
            return { marketId: obj.marketId, marketName: obj.marketName, outcome: obj.outcome };
        } catch {
            return null;
        }
    }
}

function trunc(token_id: string): string {
    if (token_id.length <= SHORT_LEN * 2 + 1) return token_id;
    return `${token_id.slice(0, SHORT_LEN)}…${token_id.slice(-4)}`;
}
