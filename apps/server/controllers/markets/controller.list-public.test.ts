import { afterAll, afterEach, beforeAll, beforeEach, expect, mock, spyOn, test } from "bun:test";
import express from "express";

const listing = {
    volume24hUsd: 10,
    liquidityUsd: 20,
    market: {
        id: "market",
        name: "Test market",
        description: "Description",
        endAt: new Date("2030-01-01T00:00:00Z"),
        status: "OPEN",
        polyMarketId: "poly-market",
        solanaMarketPda: null,
        kind: "STANDARD",
        fastSeriesKey: null,
        winningOutcome: null,
        resolvedAt: null,
        polymarket: {
            yesTokenId: "yes",
            noTokenId: "no",
            tickSize: "0.01",
            negRisk: false,
            imageUrl: null,
            eventId: "event",
            eventSlug: "event",
            tags: ["Politics", "Crypto"],
        },
    },
};
const find_listings = mock(async () => [listing]);
const find_resolvers = mock(async () => [{ marketId: "market", stage: "SOLANA_RESOLVED" }]);

mock.module("@solmarket/database", () => ({
    prisma: {
        listing: { findMany: find_listings },
        resolverState: { findMany: find_resolvers },
    },
}));

const { default: ListPublicMarketsController } = await import("./controller.list-public");
const app = express();
app.get("/", ListPublicMarketsController.process);
let server: ReturnType<typeof app.listen>;
let url: string;
let now_ms = 0;
let clock: ReturnType<typeof spyOn<typeof Date, "now">>;

beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
        server = app.listen(0, "127.0.0.1", (error) => (error ? reject(error) : resolve()));
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP test server");
    url = `http://127.0.0.1:${address.port}/`;
});

afterAll(
    () =>
        new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
        }),
);

beforeEach(() => {
    now_ms += 60_000;
    clock = spyOn(Date, "now").mockImplementation(() => now_ms);
    find_listings.mockReset();
    find_listings.mockResolvedValue([listing]);
    find_resolvers.mockClear();
});

afterEach(() => clock.mockRestore());

async function request(query = "") {
    const response = await fetch(url + query);
    return { status: response.status, body: await response.json() };
}

test("reuses snapshots for equivalent tags and preserves market responses", async () => {
    const first = await request("?tag=Politics,Crypto");
    const second = await request("?tag=crypto&tag=politics&tag=CRYPTO");
    expect(first.status).toBe(200);
    const expected = {
        success: true,
        message: "Markets",
        data: [{ id: "market", name: "Test market", claimable: true }],
    };
    expect(first.body).toMatchObject(expected);
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject(expected);
    expect(find_listings).toHaveBeenCalledTimes(1);
    expect(find_resolvers).toHaveBeenCalledTimes(1);
});

test("caches empty unfiltered results", async () => {
    find_listings.mockResolvedValueOnce([]);
    const first = await request();
    expect(first.body).toMatchObject({ success: true, data: [] });
    const second = await request("?tag=,,");
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ success: true, message: "Markets", data: [] });
    expect(find_listings).toHaveBeenCalledTimes(1);
    expect(find_resolvers).not.toHaveBeenCalled();
});

test("expires snapshots at three seconds without extending TTL on reads", async () => {
    await request("?tag=expiry");
    now_ms += 2_999;
    await request("?tag=expiry");
    expect(find_listings).toHaveBeenCalledTimes(1);
    now_ms += 1;
    await request("?tag=expiry");
    expect(find_listings).toHaveBeenCalledTimes(2);
});

test("starts the snapshot TTL when the database work completes", async () => {
    find_listings.mockImplementationOnce(async () => {
        now_ms += 5_000;
        return [listing];
    });
    await request("?tag=slow");
    await request("?tag=slow");
    expect(find_listings).toHaveBeenCalledTimes(1);
});

test("evicts the oldest snapshot after one hundred distinct tag keys", async () => {
    for (let i = 0; i < 100; i++) await request(`?tag=capacity-${i}`);
    await request("?tag=capacity-0");
    expect(find_listings).toHaveBeenCalledTimes(100);
    await request("?tag=capacity-100");
    await request("?tag=capacity-1");
    expect(find_listings).toHaveBeenCalledTimes(101);
    await request("?tag=capacity-0");
    expect(find_listings).toHaveBeenCalledTimes(102);
});

test("returns existing system errors and does not cache failures", async () => {
    const error = new Error("Database unavailable");
    find_listings.mockRejectedValueOnce(error);
    const log = spyOn(console, "error").mockImplementation(() => {});
    try {
        const failed = await request("?tag=failure");
        expect(failed.status).toBe(500);
        expect(failed.body).toMatchObject({ success: false, message: "Internal server error" });
        expect(log).toHaveBeenCalledWith("[markets/list-public]", error);
        expect((await request("?tag=failure")).status).toBe(200);
        expect(find_listings).toHaveBeenCalledTimes(2);
    } finally {
        log.mockRestore();
    }
});
