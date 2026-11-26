import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import type { PriceHistoryDTO } from "@solmarket/types";
import PriceHistoryCache from "./service.price-history-cache";

const history: PriceHistoryDTO = {
    marketId: "market",
    tokenId: "token",
    range: "1d",
    history: [{ t: 1, p: 0.5 }],
};
let now_ms = 0;
let clock: ReturnType<typeof spyOn<typeof Date, "now">>;

beforeEach(() => {
    now_ms = 0;
    clock = spyOn(Date, "now").mockImplementation(() => now_ms);
});

afterEach(() => clock.mockRestore());

test("caches DTOs for thirty seconds without extending freshness on reads", () => {
    const cache = new PriceHistoryCache();
    expect(cache.get("market:1d")).toBeNull();
    cache.set("market:1d", history);
    now_ms = 29_999;
    expect(cache.get("market:1d")).toBe(history);
    now_ms = 30_000;
    expect(cache.get("market:1d")).toBeNull();
});

test("retains at most one thousand histories and refreshes replacements", () => {
    const cache = new PriceHistoryCache();
    for (let i = 0; i < 1_000; i++) cache.set(`${i}:1d`, history);
    const updated = { ...history, history: [] };
    cache.set("0:1d", updated);
    expect(cache.get("1:1d")).toBe(history);
    cache.set("1000:1d", history);
    expect(cache.get("1:1d")).toBeNull();
    expect(cache.get("0:1d")).toBe(updated);
    for (let i = 2; i <= 1_000; i++) expect(cache.get(`${i}:1d`)).toBe(history);
});
