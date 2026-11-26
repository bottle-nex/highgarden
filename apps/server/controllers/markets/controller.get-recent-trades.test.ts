import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { request, response, type Request, type Response } from "express";
import { ListingStatus, Side, Outcome, type RecentTradeDTO } from "@solmarket/types";
import type { CustomResponse } from "../../services/service.response";

interface Listing {
    status: ListingStatus;
    market: { id: string } | null;
}

type Fill = Omit<RecentTradeDTO, "createdAt"> & { createdAt: Date };

const find_listing = mock(async (_args: unknown): Promise<Listing | null> => null);
const find_fills = mock(async (_args: unknown): Promise<Fill[]> => []);

mock.module("@solmarket/database", () => ({
    prisma: { listing: { findUnique: find_listing }, fill: { findMany: find_fills } },
}));

const { default: GetRecentTradesController } = await import("./controller.get-recent-trades");

async function process_request(query: Request["query"] = {}, id = "market-1") {
    const req = new global.Proxy(request, {
        get(target, property, receiver) {
            if (property === "params") return { id };
            if (property === "query") return query;
            return Reflect.get(target, property, receiver);
        },
    });
    const status = mock((_code: number): Response => res);
    const json = mock((_body: CustomResponse): Response => res);
    const res = new global.Proxy(response, {
        get(target, property, receiver) {
            if (property === "status") return status;
            if (property === "json") return json;
            return Reflect.get(target, property, receiver);
        },
    });

    await GetRecentTradesController.process(req, res);
    return { status, json };
}

beforeEach(() => {
    find_listing.mockReset();
    find_fills.mockReset();
    find_listing.mockResolvedValue({ status: ListingStatus.APPROVED, market: { id: "market-1" } });
    find_fills.mockResolvedValue([]);
});

describe("recent trades market validation", () => {
    test("rejects a missing ID before querying the database", async () => {
        const { status, json } = await process_request({}, "");
        expect(status).toHaveBeenCalledWith(400);
        expect(json).toHaveBeenCalledWith(
            expect.objectContaining({ success: false, message: "id required" }),
        );
        expect(find_listing).not.toHaveBeenCalled();
        expect(find_fills).not.toHaveBeenCalled();
    });

    test.each([
        null,
        { status: ListingStatus.PENDING, market: { id: "market-1" } },
        { status: ListingStatus.REJECTED, market: { id: "market-1" } },
        { status: ListingStatus.APPROVED, market: null },
    ])("returns market not found for an unavailable listing: %j", async (listing) => {
        find_listing.mockResolvedValue(listing);
        const { status, json } = await process_request();
        expect(status).toHaveBeenCalledWith(404);
        expect(json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: false,
                message: "market not found",
                error: { code: "NOT_FOUND" },
            }),
        );
        expect(find_listing).toHaveBeenCalledWith(
            expect.objectContaining({ where: { marketId: "market-1" } }),
        );
        expect(find_fills).not.toHaveBeenCalled();
    });

    test("returns an empty list for an approved market without fills", async () => {
        const { status, json } = await process_request();
        expect(status).toHaveBeenCalledWith(200);
        expect(json).toHaveBeenCalledWith(
            expect.objectContaining({ success: true, data: [], message: "RecentTrades" }),
        );
    });
});

describe("recent trades limits", () => {
    test.each([
        [{}, 50],
        [{ limit: "" }, 50],
        [{ limit: "   " }, 50],
        [{ limit: "invalid" }, 50],
        [{ limit: "Infinity" }, 50],
        [{ limit: "NaN" }, 50],
        [{ limit: ["2", "3"] }, 50],
        [{ limit: ["2"] }, 50],
        [{ limit: { value: "2" } }, 50],
        [{ limit: "12" }, 12],
        [{ limit: " 12 " }, 12],
        [{ limit: "12.9" }, 12],
        [{ limit: "0.5" }, 1],
        [{ limit: "0" }, 1],
        [{ limit: "-5" }, 1],
        [{ limit: "201" }, 200],
    ] satisfies [Request["query"], number][])("uses %j with limit %i", async (query, limit) => {
        const { status } = await process_request(query);
        expect(status).toHaveBeenCalledWith(200);
        expect(find_fills).toHaveBeenCalledWith({
            where: { marketId: "market-1" },
            orderBy: { createdAt: "desc" },
            take: limit,
        });
    });
});

test("maps fills without changing their newest-first order", async () => {
    const fills: Fill[] = [
        {
            id: "fill-2",
            side: Side.BUY,
            outcome: Outcome.YES,
            price: 60,
            size: 10,
            solanaTxSig: "signature-2",
            createdAt: new Date("2026-11-26T12:00:00Z"),
        },
        {
            id: "fill-1",
            side: Side.SELL,
            outcome: Outcome.NO,
            price: 40,
            size: 5,
            solanaTxSig: "signature-1",
            createdAt: new Date("2026-11-26T11:00:00Z"),
        },
    ];
    find_fills.mockResolvedValue(fills);
    const { json } = await process_request();
    expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
            success: true,
            data: fills.map((fill) => ({ ...fill, createdAt: fill.createdAt.toISOString() })),
        }),
    );
});

test.each(["listing", "fills"])("returns a system error when %s lookup fails", async (lookup) => {
    const error = new Error("database unavailable");
    if (lookup === "listing") find_listing.mockRejectedValue(error);
    else find_fills.mockRejectedValue(error);
    const log = spyOn(console, "error").mockImplementation(() => {});
    try {
        const { status, json } = await process_request();
        expect(status).toHaveBeenCalledWith(500);
        expect(json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: false,
                error: { code: "INTERNAL_SERVER_ERROR" },
            }),
        );
        expect(log).toHaveBeenCalledWith("[markets/get-recent-trades]", error);
        if (lookup === "listing") expect(find_fills).not.toHaveBeenCalled();
    } finally {
        log.mockRestore();
    }
});
