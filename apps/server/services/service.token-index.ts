import Redis from "ioredis";
import { ENV } from "../config/config.env";
import { REDIS_CHANNELS, type TokenIndexEntry } from "@solmarket/polymarket-contracts";

const SHORT_LEN = 8;

/**
 * Read-through, in-memory cache of token_id → {marketId, marketName, outcome}.
 *
 * The HASH itself is the source of truth (server writes it on hydrate /
 * approve / reject). This service hydrates from HGETALL on boot and refreshes
 * on the change pubsub. It also exposes a writer for the server's controllers
 * to keep the HASH in sync with Postgres.
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
        const raw = await this.cmd.hgetall(REDIS_CHANNELS.token_index);
        const next = new Map<string, TokenIndexEntry>();
        for (const [token_id, json] of Object.entries(raw)) {
            const parsed = this.parse(json);
            if (parsed) next.set(token_id, parsed);
        }
        this.cache = next;
    }

    public get(token_id: string): TokenIndexEntry | null {
        return this.cache.get(token_id) ?? null;
    }

    public label(token_id: string): string {
        const short = trunc(token_id);
        const entry = this.cache.get(token_id);
        if (!entry) return short;
        return `${short} ${entry.marketId}/${entry.outcome}`;
    }

    public snapshot(): Record<string, TokenIndexEntry> {
        return Object.fromEntries(this.cache);
    }

    public async write(entries: Array<{ token_id: string; entry: TokenIndexEntry }>): Promise<void> {
        if (entries.length === 0) return;
        const flat: Record<string, string> = {};
        for (const { token_id, entry } of entries) {
            flat[token_id] = JSON.stringify(entry);
        }
        await this.cmd.hset(REDIS_CHANNELS.token_index, flat);
        await this.cmd.publish(REDIS_CHANNELS.token_index_changed, "");
        // Update local cache immediately to avoid a round-trip on the writer.
        for (const { token_id, entry } of entries) this.cache.set(token_id, entry);
    }

    public async remove(token_ids: string[]): Promise<void> {
        if (token_ids.length === 0) return;
        await this.cmd.hdel(REDIS_CHANNELS.token_index, ...token_ids);
        await this.cmd.publish(REDIS_CHANNELS.token_index_changed, "");
        for (const id of token_ids) this.cache.delete(id);
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
