import type { PriceHistoryDTO } from "@solmarket/types";

const TTL_MS = 30_000;

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
        this.entries.set(key, { at: Date.now(), data });
    }
}
