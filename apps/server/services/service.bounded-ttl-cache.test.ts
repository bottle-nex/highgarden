import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import BoundedTtlCache from "./service.bounded-ttl-cache";

let now_ms = 0;
let clock: ReturnType<typeof spyOn<typeof Date, "now">>;

beforeEach(() => {
    now_ms = 0;
    clock = spyOn(Date, "now").mockImplementation(() => now_ms);
});

afterEach(() => clock.mockRestore());

test("returns live values and misses, expiring at the exact deadline", () => {
    const cache = new BoundedTtlCache<string>(100, 2);
    expect(cache.get("missing")).toBeNull();
    cache.set("a", "value");
    now_ms = 99;
    expect(cache.get("a")).toBe("value");
    now_ms = 100;
    expect(cache.get("a")).toBeNull();
    expect(cache.get("a")).toBeNull();
});

test("reclaims abandoned expired entries before evicting live entries", () => {
    const cache = new BoundedTtlCache<string>(100, 3);
    cache.set("expired-a", "a");
    cache.set("expired-b", "b");
    now_ms = 50;
    cache.set("live", "live");
    now_ms = 100;
    cache.set("new-a", "a");
    cache.set("new-b", "b");
    expect(cache.get("live")).toBe("live");
    expect(cache.get("new-a")).toBe("a");
    expect(cache.get("new-b")).toBe("b");
    expect(cache.get("expired-a")).toBeNull();
    expect(cache.get("expired-b")).toBeNull();
});

test("evicts the oldest write even when it was recently read", () => {
    const cache = new BoundedTtlCache<string>(100, 2);
    cache.set("a", "a");
    cache.set("b", "b");
    expect(cache.get("a")).toBe("a");
    cache.set("c", "c");
    expect(cache.get("a")).toBeNull();
    expect(cache.get("b")).toBe("b");
    expect(cache.get("c")).toBe("c");
});

test("sweeps all expired entries on writes even below capacity", () => {
    const cache = new BoundedTtlCache<string>(100, 3);
    cache.set("expired-a", "a");
    cache.set("expired-b", "b");
    now_ms = 100;
    cache.set("new", "new");
    // A clock correction must not resurrect entries removed by the write sweep.
    now_ms = 99;
    expect(cache.get("expired-a")).toBeNull();
    expect(cache.get("expired-b")).toBeNull();
    expect(cache.get("new")).toBe("new");
});

test("overwrites refresh order and TTL without evicting other live entries", () => {
    const cache = new BoundedTtlCache<string>(100, 2);
    cache.set("a", "old");
    cache.set("b", "b");
    now_ms = 50;
    for (let i = 0; i < 10; i++) cache.set("a", "updated");
    expect(cache.get("b")).toBe("b");
    cache.set("c", "c");
    expect(cache.get("b")).toBeNull();
    now_ms = 100;
    expect(cache.get("a")).toBe("updated");
    now_ms = 150;
    expect(cache.get("a")).toBeNull();
});

test("retains only the newest entries under sustained unique-key writes", () => {
    const cache = new BoundedTtlCache<number>(100, 3);
    for (let i = 0; i < 100; i++) cache.set(String(i), i);
    for (let i = 0; i < 97; i++) expect(cache.get(String(i))).toBeNull();
    for (let i = 97; i < 100; i++) expect(cache.get(String(i))).toBe(i);
});

test("supports a single entry and rejects invalid capacities", () => {
    const cache = new BoundedTtlCache<number>(100, 1);
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.get("a")).toBeNull();
    expect(cache.get("b")).toBe(2);
    for (const capacity of [0, -1, 1.5, Infinity, NaN]) {
        expect(() => new BoundedTtlCache(100, capacity)).toThrow(RangeError);
    }
});
