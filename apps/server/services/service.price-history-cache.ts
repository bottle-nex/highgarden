import type { PriceHistoryDTO } from "@solmarket/types";

const TTL_MS = 30_000;
const MAX_ENTRIES = 256;

interface Entry {
    at: number;
    data: PriceHistoryDTO;
}

export default class PriceHistoryCache {
    private readonly entries = new Map<string, Entry>();

    public get(key: string): PriceHistoryDTO | null {
        const entry = this.entries.get(key);
        if (!entry) return null;
        if (Date.now() - entry.at > TTL_MS) {
            this.entries.delete(key);
            return null;
        }
        return entry.data;
    }

    public set(key: string, data: PriceHistoryDTO): void {
        const now = Date.now();
        for (const [entry_key, entry] of this.entries) {
            if (now - entry.at > TTL_MS) this.entries.delete(entry_key);
        }
        this.entries.delete(key);
        if (this.entries.size >= MAX_ENTRIES) {
            const oldest_key = this.entries.keys().next().value;
            if (oldest_key !== undefined) this.entries.delete(oldest_key);
        }
        this.entries.set(key, { at: now, data });
    }
}
