import { afterAll, beforeAll, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import express from "express";
import type { Prisma } from "@solmarket/database";

function comment(id: string, reportCount: number, userId = "author") {
    return {
        id,
        eventId: "event",
        userId,
        body: `Comment ${id}`,
        reportCount,
        createdAt: new Date("2026-05-01T00:00:00Z"),
        user: {
            id: userId,
            name: "Author",
            email: "author@example.com",
            walletAddress: null,
            custodialPublicKey: null,
        },
    };
}

const find_market = mock(
    (): Promise<{ polymarket: { eventId: string } | null } | null> =>
        Promise.resolve({ polymarket: { eventId: "event" } }),
);
const find_comments = mock((_args: Prisma.CommentFindManyArgs) =>
    Promise.resolve([comment("unreported", 0), comment("four-reports", 4)]),
);
mock.module("@solmarket/database", () => ({
    prisma: { market: { findUnique: find_market }, comment: { findMany: find_comments } },
}));

const { default: ListCommentsController } = await import("./controller.list-comments");
const app = express();
// Supply the identity normally set by authentication, without starting server services.
app.get("/:viewer/:id/comments", (req, res) => {
    if (req.params.viewer !== "anonymous") {
        req.user = { id: req.params.viewer, email: "viewer@example.com" };
    }
    return ListCommentsController.process(req, res);
});

let server: ReturnType<typeof app.listen>;
let base_url: string;

beforeAll(() => {
    server = app.listen(0, "127.0.0.1");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server has no port");
    base_url = `http://127.0.0.1:${address.port}`;
});

afterAll(() => server.close());

beforeEach(() => {
    find_market.mockClear();
    find_market.mockImplementation(() => Promise.resolve({ polymarket: { eventId: "event" } }));
    find_comments.mockClear();
    find_comments.mockImplementation(() =>
        Promise.resolve([comment("unreported", 0), comment("four-reports", 4)]),
    );
});

describe("ListCommentsController visibility", () => {
    test("restricts anonymous reads to fewer than five reports before pagination", async () => {
        const res = await fetch(`${base_url}/anonymous/market/comments?limit=2&offset=3`);
        expect(res.status).toBe(200);
        expect(find_comments).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { eventId: "event", OR: [{ reportCount: { lt: 5 } }] },
                orderBy: { createdAt: "desc" },
                take: 2,
                skip: 3,
            }),
        );
        expect(await res.json()).toMatchObject({
            data: {
                eventId: "event",
                comments: [
                    { id: "unreported", reportCount: 0 },
                    { id: "four-reports", reportCount: 4 },
                ],
            },
        });
    });

    test.each(["author", "other-reader"])(
        "restricts the author exception to the authenticated viewer %s and current event",
        async (viewer) => {
            const res = await fetch(`${base_url}/${viewer}/market/comments`);
            expect(res.status).toBe(200);
            expect(find_comments).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        eventId: "event",
                        OR: [{ reportCount: { lt: 5 } }, { userId: viewer }],
                    },
                    take: 30,
                    skip: 0,
                }),
            );
        },
    );

    test("returns the author's own comments with five or more reports unchanged", async () => {
        find_comments.mockResolvedValueOnce([
            comment("five-reports", 5),
            comment("six-reports", 6),
        ]);
        const res = await fetch(`${base_url}/author/market/comments`);
        expect(await res.json()).toMatchObject({
            data: {
                comments: [
                    {
                        id: "five-reports",
                        body: "Comment five-reports",
                        reportCount: 5,
                        createdAt: "2026-05-01T00:00:00.000Z",
                        author: { userId: "author", username: "Author", walletShort: null },
                    },
                    { id: "six-reports", reportCount: 6 },
                ],
            },
        });
    });

    test("returns an empty discussion when no visible comments remain", async () => {
        find_comments.mockResolvedValueOnce([]);
        const res = await fetch(`${base_url}/anonymous/market/comments`);
        expect(await res.json()).toMatchObject({ data: { eventId: "event", comments: [] } });
    });

    test("preserves unavailable-event responses without querying comments", async () => {
        find_market.mockResolvedValueOnce({ polymarket: null });
        const res = await fetch(`${base_url}/anonymous/market/comments`);
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ data: { eventId: null, comments: [] } });
        expect(find_comments).not.toHaveBeenCalled();
    });

    test("preserves missing-market responses", async () => {
        find_market.mockResolvedValueOnce(null);
        const res = await fetch(`${base_url}/anonymous/missing/comments`);
        expect(res.status).toBe(404);
        expect(find_comments).not.toHaveBeenCalled();
    });

    test("returns the existing error envelope when the query fails", async () => {
        find_comments.mockRejectedValueOnce(new Error("database unavailable"));
        const log = spyOn(console, "error").mockImplementation(() => {});
        try {
            const res = await fetch(`${base_url}/anonymous/market/comments`);
            expect(res.status).toBe(500);
            expect(await res.json()).toMatchObject({ success: false });
        } finally {
            log.mockRestore();
        }
    });
});
