import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import express from "express";

const market = { polymarket: { eventId: "event-1" } };
let name: string | null = null;
const comment = () => ({
    id: "comment-1",
    eventId: "event-1",
    body: "Hello",
    reportCount: 0,
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
    user: {
        id: "user-1",
        name,
        email: "private@example.com",
        walletAddress: "1234567890123456",
        custodialPublicKey: null,
    },
});
const create = mock(async (_args: { include: { user: { select: object } } }) => comment());
const findMany = mock(async (_args: { include: { user: { select: object } } }) => [comment()]);

mock.module("@solmarket/database", () => ({
    prisma: {
        market: { findUnique: async () => market },
        comment: { create, findMany },
    },
}));

const { default: CreateCommentController } = await import("./controller.create-comment");
const { default: ListCommentsController } = await import("./controller.list-comments");

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
    req.user = { id: "user-1", email: "private@example.com" };
    next();
});
app.post("/markets/:id/comments", CreateCommentController.process);
app.get("/markets/:id/comments", ListCommentsController.process);
let resolve_listening: () => void = () => {};
const listening = new Promise<void>((resolve) => {
    resolve_listening = resolve;
});
const server = app.listen(0, () => resolve_listening());
let url: string;

beforeAll(async () => {
    await listening;
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Server did not bind to a port");
    url = `http://127.0.0.1:${address.port}/markets/market-1/comments`;
});
afterAll(() => server.close());

describe("comment author privacy", () => {
    for (const [display_name, expected] of [
        [null, "anon"],
        ["", "anon"],
        ["Display Name", "Display Name"],
    ] as const) {
        test(`create and list use ${JSON.stringify(expected)} for name ${JSON.stringify(display_name)}`, async () => {
            name = display_name;
            const posted = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ body: "Hello" }),
            });
            const listed = await fetch(url);
            expect(posted.status).toBe(201);
            expect(listed.status).toBe(200);
            const posted_body = await posted.json();
            const listed_body = await listed.json();
            const author = { userId: "user-1", username: expected, walletShort: "1234...3456" };
            expect(posted_body).toMatchObject({ data: { author } });
            expect(listed_body).toMatchObject({ data: { comments: [{ author }] } });
            expect(JSON.stringify(posted_body)).not.toContain("private");
            expect(JSON.stringify(listed_body)).not.toContain("private");
            expect(create.mock.lastCall?.[0].include.user.select).not.toHaveProperty("email");
            expect(findMany.mock.lastCall?.[0].include.user.select).not.toHaveProperty("email");
        });
    }
});
