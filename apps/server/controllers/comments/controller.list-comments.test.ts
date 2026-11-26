import { afterAll, beforeAll, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import express from "express";
import { z } from "zod";

const comments = Array.from({ length: 120 }, (_, index) => ({
    id: `comment-${index}`,
    eventId: "event-1",
    body: `Post ${index}`,
    reportCount: 0,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    user: {
        id: "user-1",
        name: "Trader",
        email: "trader@example.com",
        walletAddress: "1234567890abcdef",
        custodialPublicKey: null,
    },
}));
interface TestMarket {
    polymarket: { eventId: string | null } | null;
}

const find_market = mock(
    async (): Promise<TestMarket | null> => ({
        polymarket: { eventId: "event-1" },
    }),
);
const count_comments = mock(async (_args: { where: { eventId: string } }) => 0);
const find_comments = mock(
    async (_args: { where: { eventId: string }; take: number; skip: number }) =>
        comments.slice(0, 0),
);

mock.module("@solmarket/database", () => ({
    prisma: {
        market: { findUnique: find_market },
        comment: { count: count_comments, findMany: find_comments },
    },
}));
const { default: ListCommentsController } = await import("./controller.list-comments");

const list_envelope = z.object({
    success: z.boolean(),
    data: z
        .object({
            eventId: z.string().nullable(),
            comments: z.array(
                z.object({
                    id: z.string(),
                    eventId: z.string(),
                    body: z.string(),
                    reportCount: z.number(),
                    createdAt: z.string(),
                    author: z.object({
                        userId: z.string(),
                        username: z.string(),
                        walletShort: z.string().nullable(),
                    }),
                }),
            ),
            total: z.number(),
            hasMore: z.boolean(),
        })
        .optional(),
    error: z.object({ code: z.string() }).optional(),
});

const app = express();
let server: ReturnType<typeof app.listen>;
let base_url: string;

beforeAll(() => {
    app.get("/markets/:id/comments", ListCommentsController.process);
    app.get("/comments", ListCommentsController.process);
    server = app.listen(0, "127.0.0.1");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server address");
    base_url = `http://127.0.0.1:${address.port}`;
});

afterAll(
    () =>
        new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
            server.closeAllConnections();
        }),
);

beforeEach(() => {
    find_market.mockReset();
    count_comments.mockReset();
    find_comments.mockReset();
    find_market.mockResolvedValue({ polymarket: { eventId: "event-1" } });
    count_comments.mockResolvedValue(0);
    find_comments.mockResolvedValue([]);
});

async function request(path = "/markets/market-1/comments") {
    const response = await fetch(`${base_url}${path}`);
    const body = list_envelope.parse(await response.json());
    return { response, body };
}

describe("native comment pagination", () => {
    for (const total of [0, 1, 29, 30, 31, 60, 120]) {
        for (const offset of [...new Set([0, 30, Math.max(0, total - 30), total + 1])]) {
            test(`${total} comments at offset ${offset}`, async () => {
                count_comments.mockResolvedValue(total);
                find_comments.mockImplementation(async ({ take, skip }) =>
                    comments.slice(0, total).slice(skip, skip + take),
                );
                const { response, body } = await request(
                    `/markets/market-1/comments?limit=30&offset=${offset}`,
                );
                expect(response.status).toBe(200);
                expect(body.success).toBe(true);
                if (!body.data) throw new Error("Missing comments data");
                expect(body.data.eventId).toBe("event-1");
                expect(body.data.total).toBe(total);
                expect(body.data.hasMore).toBe(total > offset + 30);
                expect(body.data.comments).toHaveLength(Math.min(30, Math.max(0, total - offset)));
                expect(body.data.comments.map((comment) => comment.id)).toEqual(
                    comments
                        .slice(0, total)
                        .slice(offset, offset + 30)
                        .map((comment) => comment.id),
                );
                expect(count_comments).toHaveBeenCalledWith({ where: { eventId: "event-1" } });
                expect(find_comments).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: { eventId: "event-1" },
                        take: 31,
                        skip: offset,
                        orderBy: { createdAt: "desc" },
                    }),
                );
            });
        }
    }

    test("preserves the comment DTO and defaults to a 30-comment page", async () => {
        count_comments.mockResolvedValue(1);
        find_comments.mockResolvedValue(comments.slice(0, 1));
        const { body } = await request();
        if (!body.data) throw new Error("Missing comments data");
        expect(body.data.comments[0]).toEqual({
            id: "comment-0",
            eventId: "event-1",
            body: "Post 0",
            reportCount: 0,
            createdAt: "2026-01-01T00:00:00.000Z",
            author: { userId: "user-1", username: "Trader", walletShort: "1234...cdef" },
        });
        expect(find_comments).toHaveBeenCalledWith(expect.objectContaining({ take: 31, skip: 0 }));
    });

    test("keeps the existing limit cap and normalizes negative offsets", async () => {
        await request("/markets/market-1/comments?limit=100&offset=-1");
        expect(find_comments).toHaveBeenCalledWith(expect.objectContaining({ take: 51, skip: 0 }));
    });

    for (const polymarket of [null, { eventId: null }]) {
        test(`returns empty metadata when discussion is unavailable (${JSON.stringify(polymarket)})`, async () => {
            find_market.mockResolvedValue({ polymarket });
            const { response, body } = await request();
            expect(response.status).toBe(200);
            expect(body.data).toEqual({ eventId: null, comments: [], total: 0, hasMore: false });
            expect(count_comments).not.toHaveBeenCalled();
            expect(find_comments).not.toHaveBeenCalled();
        });
    }

    test("returns not found for a missing market", async () => {
        find_market.mockResolvedValue(null);
        const { response, body } = await request();
        expect(response.status).toBe(404);
        expect(body.error?.code).toBe("NOT_FOUND");
        expect(count_comments).not.toHaveBeenCalled();
        expect(find_comments).not.toHaveBeenCalled();
    });

    test("rejects a missing market id before database access", async () => {
        const { response, body } = await request("/comments");
        expect(response.status).toBe(400);
        expect(body.error?.code).toBe("INVALID_DATA");
        expect(find_market).not.toHaveBeenCalled();
    });

    for (const operation of [find_market, count_comments, find_comments]) {
        test(`returns a system error when a database read fails (${operation === count_comments ? "count" : operation === find_comments ? "page" : "market"})`, async () => {
            const error = new Error("Database unavailable");
            operation.mockRejectedValueOnce(error);
            const log = spyOn(console, "error").mockImplementation(() => {});
            try {
                const { response, body } = await request();
                expect(response.status).toBe(500);
                expect(body.success).toBe(false);
                expect(body.error?.code).toBe("INTERNAL_SERVER_ERROR");
                expect(log).toHaveBeenCalledWith("[comments/list]", error);
            } finally {
                log.mockRestore();
            }
        });
    }
});
