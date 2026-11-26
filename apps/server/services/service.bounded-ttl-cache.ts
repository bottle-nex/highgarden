interface Entry<T> {
    expires_at: number;
    data: T;
}

/** Bounded cache ordered by last write; reads do not extend freshness or retention. */
export default class BoundedTtlCache<T> {
    private readonly entries = new Map<string, Entry<T>>();
    private readonly ttl_ms: number;
    private readonly max_entries: number;

    constructor(ttl_ms: number, max_entries: number) {
        if (!Number.isInteger(max_entries) || max_entries < 1) {
            throw new RangeError("Cache capacity must be a positive integer");
        }
        this.ttl_ms = ttl_ms;
        this.max_entries = max_entries;
    }

    public get(key: string): T | null {
        const entry = this.entries.get(key);
        if (!entry) return null;
        if (entry.expires_at <= Date.now()) {
            this.entries.delete(key);
            return null;
        }
        return entry.data;
    }

    public set(key: string, data: T): void {
        const now_ms = Date.now();
        for (const [entry_key, entry] of this.entries) {
            if (entry.expires_at <= now_ms) this.entries.delete(entry_key);
        }

        // Replacements become newest without evicting an unrelated live entry.
        this.entries.delete(key);
        while (this.entries.size >= this.max_entries) {
            const oldest = this.entries.keys().next();
            if (oldest.done) break;
            this.entries.delete(oldest.value);
        }
        this.entries.set(key, { expires_at: now_ms + this.ttl_ms, data });
    }
}
