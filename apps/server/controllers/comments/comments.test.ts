import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import express from "express";
import type { CommentDTO } from "@solmarket/types";

const comment = comment_row(null);

interface CommentQuery {
    include: { user: { select: Record<string, boolean> } };
}

const create_comment = mock(async (_query: CommentQuery) => comment);
const find_comments = mock(async (_query: CommentQuery) => [comment]);

mock.module("@solmarket/database", () => ({
    prisma: {
        market: {
            findUnique: mock(async () => ({ polymarket: { eventId: "event-id" } })),
        },
        comment: { create: create_comment, findMany: find_comments },
    },
}));

const { default: CreateCommentController } = await import("./controller.create-comment");
const { default: ListCommentsController } = await import("./controller.list-comments");

const app = express();
app.use(express.json());
app.post("/markets/:id/comments", (req, res) => {
    req.user = { id: "user-id", email: comment.user.email };
    return CreateCommentController.process(req, res);
});
app.get("/markets/:id/comments", ListCommentsController.process);

let server: ReturnType<typeof app.listen>;
let base_url: string;

beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
        server = app.listen(0, "127.0.0.1", (err) => (err ? reject(err) : resolve()));
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP address");
    base_url = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
    });
});

beforeEach(() => {
    create_comment.mockClear();
    find_comments.mockClear();
});

for (const method of ["POST", "GET"]) {
    describe(`${method} /markets/:id/comments`, () => {
        it.each([
            { name: null, username: "user", description: "missing names" },
            { name: "", username: "user", description: "empty names" },
            { name: "Public Name", username: "Public Name", description: "explicit names" },
        ])("keeps email private for $description", async ({ name, username }) => {
            comment.user.name = name;
            const response = await fetch(`${base_url}/markets/market-id/comments`, {
                method,
                ...(method === "POST"
                    ? {
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ body: comment.body }),
                      }
                    : {}),
            });
            const result: unknown = await response.json();

            expect(response.status).toBe(method === "POST" ? 201 : 200);
            expect(result).toEqual({
                success: true,
                message: method === "POST" ? "Comment posted" : "Comments",
                data:
                    method === "POST"
                        ? expected_comment(username)
                        : { eventId: "event-id", comments: [expected_comment(username)] },
                meta: { timestamp: expect.any(String) },
            });
            expect(JSON.stringify(result)).not.toContain("private-email-name");
            expect(JSON.stringify(result)).not.toContain(comment.user.email);

            const query = method === "POST" ? create_comment : find_comments;
            expect(query).toHaveBeenCalledTimes(1);
            expect(query.mock.calls[0]?.[0].include.user.select).toEqual({
                id: true,
                name: true,
                walletAddress: true,
                custodialPublicKey: true,
            });
        });
    });
}

function comment_row(name: string | null) {
    return {
        id: "comment-id",
        eventId: "event-id",
        body: "A public comment",
        reportCount: 0,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        user: {
            id: "user-id",
            name,
            email: "private-email-name@example.com",
            walletAddress: "1234567890abcdef",
            custodialPublicKey: null,
        },
    };
}

function expected_comment(username: string): CommentDTO {
    return {
        id: comment.id,
        eventId: comment.eventId,
        body: comment.body,
        reportCount: comment.reportCount,
        createdAt: comment.createdAt.toISOString(),
        author: { userId: "user-id", username, walletShort: "1234...cdef" },
    };
}
