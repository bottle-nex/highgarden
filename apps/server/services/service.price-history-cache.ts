import type { PriceHistoryDTO } from "@solmarket/types";
import BoundedTtlCache from "./service.bounded-ttl-cache";

const TTL_MS = 30_000;
const MAX_ENTRIES = 1_000;

export default class PriceHistoryCache {
    private readonly entries = new BoundedTtlCache<PriceHistoryDTO>(TTL_MS, MAX_ENTRIES);

    public get(key: string): PriceHistoryDTO | null {
        return this.entries.get(key);
    }

    public set(key: string, data: PriceHistoryDTO): void {
        this.entries.set(key, data);
    }
}
