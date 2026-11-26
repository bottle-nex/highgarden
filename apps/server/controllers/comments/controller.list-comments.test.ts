import { beforeEach, describe, expect, mock, test } from "bun:test";
import express from "express";

const findUnique = mock();
const findMany = mock((_args: { where: { eventId: string }; take: number; skip: number }) =>
    Promise.resolve([]),
);
const count = mock();
mock.module("@solmarket/database", () => ({
    prisma: { market: { findUnique }, comment: { findMany, count } },
}));

const { default: ListCommentsController } = await import("./controller.list-comments");

async function list(offset = 0) {
    const app = express();
    app.get("/markets/:id/comments", ListCommentsController.process);
    const server = app.listen(0);
    try {
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("No server address");
        const response = await fetch(
            `http://127.0.0.1:${address.port}/markets/market/comments?limit=30&offset=${offset}`,
        );
        return { statusCode: response.status, body: await response.json() };
    } finally {
        server.close();
    }
}

describe("list comments", () => {
    beforeEach(() => {
        findUnique.mockReset();
        findMany.mockReset();
        count.mockReset();
        findUnique.mockResolvedValue({ polymarket: { eventId: "event" } });
        findMany.mockResolvedValue([]);
    });

    for (const total of [0, 29, 30, 31, 60, 120]) {
        test(`returns the event total ${total} independently of the page`, async () => {
            count.mockResolvedValue(total);
            const response = await list(30);
            expect(response.statusCode).toBe(200);
            expect(response.body).toMatchObject({
                data: { eventId: "event", comments: [], total },
            });
            expect(count).toHaveBeenCalledWith({ where: { eventId: "event" } });
            expect(findMany.mock.calls[0]?.[0]).toMatchObject({
                where: { eventId: "event" },
                take: 30,
                skip: 30,
            });
        });
    }

    test("returns zero when discussion is unavailable", async () => {
        findUnique.mockResolvedValue({ polymarket: null });
        const response = await list();
        expect(response.body).toMatchObject({ data: { eventId: null, comments: [], total: 0 } });
        expect(count).not.toHaveBeenCalled();
    });

    test("returns an error when the count fails", async () => {
        count.mockRejectedValue(new Error("database unavailable"));
        const response = await list();
        expect(response.statusCode).toBe(500);
    });
});
