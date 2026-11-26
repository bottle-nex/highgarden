import { beforeEach, describe, expect, mock, test } from "bun:test";

const reports = new Set<string>();
let count = 0;
let missing = false;
let fail_update = false;
const db = {
    market: { findUnique: async () => ({ polymarket: { eventId: "event" } }) },
    comment: {
        findUnique: async () => (missing ? null : { id: "comment" }),
        update: async () => {
            if (fail_update) throw new Error("update failed");
            count++;
        },
        findMany: async (args: {
            where: { OR: Array<{ reportCount?: { lt: number }; userId?: string }> };
            skip: number;
            take: number;
        }) => {
            const rows = [4, 5, 6].map((reportCount, i) => ({
                id: String(i),
                eventId: "event",
                body: "body",
                reportCount,
                createdAt: new Date(0),
                user: {
                    id: i === 1 ? "author" : "other",
                    name: "user",
                    email: "a@b",
                    walletAddress: null,
                    custodialPublicKey: null,
                },
            }));
            return rows
                .filter((row) =>
                    args.where.OR.some((condition) =>
                        condition.reportCount
                            ? row.reportCount < condition.reportCount.lt
                            : row.user.id === condition.userId,
                    ),
                )
                .slice(args.skip, args.skip + args.take);
        },
    },
    commentReport: {
        createMany: async ({ data }: { data: { commentId: string; userId: string } }) => {
            const key = `${data.commentId}:${data.userId}`;
            if (reports.has(key)) return { count: 0 };
            reports.add(key);
            return { count: 1 };
        },
    },
};
const prisma = {
    ...db,
    $transaction: async (fn: (_tx: typeof db) => Promise<unknown>) => {
        const previous = new Set(reports);
        try {
            return await fn(db);
        } catch (error) {
            reports.clear();
            previous.forEach((key) => reports.add(key));
            throw error;
        }
    },
};
mock.module("@solmarket/database", () => ({ prisma }));
mock.module("../../../services/service.jwt", () => ({
    verifySessionJwt: (token: string) => {
        if (token !== "valid") throw new Error("invalid token");
        return { sub: "author", email: "author@example.com" };
    },
}));
const { optionalAuth } = await import("../../../middleware/middleware.auth");
const { default: ListCommentsController } = await import("../controller.list-comments");
const { default: ReportCommentController } = await import("../controller.report-comment");

function response() {
    return {
        statusCode: 0,
        body: { data: { comments: [] as Array<{ id: string }>, alreadyReported: false } },
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        json(body: typeof this.body) {
            this.body = body;
            return this;
        },
    };
}

beforeEach(() => {
    reports.clear();
    count = 0;
    missing = false;
    fail_update = false;
});

describe("comment visibility", () => {
    test("filters before pagination and includes only the author's hidden comment", async () => {
        for (const [user, expected] of [
            [undefined, ["0"]],
            [{ id: "author" }, ["0", "1"]],
            [{ id: "other" }, ["0", "2"]],
        ] as const) {
            const res = response();
            await Reflect.apply(ListCommentsController.process, ListCommentsController, [
                { params: { id: "market" }, query: {}, user },
                res,
            ]);
            expect(res.body.data.comments.map((c) => c.id)).toEqual([...expected]);
        }
        const res = response();
        await Reflect.apply(ListCommentsController.process, ListCommentsController, [
            {
                params: { id: "market" },
                query: { limit: "1", offset: "1" },
                user: { id: "author" },
            },
            res,
        ]);
        expect(res.body.data.comments.map((c) => c.id)).toEqual(["1"]);
    });
});

describe("comment reports", () => {
    test("counts concurrent duplicate reports once", async () => {
        const results = [response(), response()];
        await Promise.all(
            results.map((res) =>
                Reflect.apply(ReportCommentController.process, ReportCommentController, [
                    { params: { id: "comment" }, user: { id: "user" } },
                    res,
                ]),
            ),
        );
        expect(count).toBe(1);
        expect(results.map((res) => res.body.data.alreadyReported).sort()).toEqual([false, true]);
    });
    test("rolls back a report if the count update fails", async () => {
        fail_update = true;
        const res = response();
        await Reflect.apply(ReportCommentController.process, ReportCommentController, [
            { params: { id: "comment" }, user: { id: "user" } },
            res,
        ]);
        expect(res.statusCode).toBe(500);
        expect(reports.size).toBe(0);
    });
    test("returns not found for a missing comment", async () => {
        missing = true;
        const res = response();
        await Reflect.apply(ReportCommentController.process, ReportCommentController, [
            { params: { id: "missing" }, user: { id: "user" } },
            res,
        ]);
        expect(res.statusCode).toBe(404);
    });
});

describe("optional authentication", () => {
    test("accepts anonymous and valid viewers and rejects invalid credentials", () => {
        for (const [header, status, user_id] of [
            [undefined, 0, undefined],
            ["Bearer valid", 0, "author"],
            ["Bearer invalid", 401, undefined],
            ["Basic invalid", 401, undefined],
        ] as const) {
            const req: { headers: { authorization: string | undefined }; user?: { id: string } } = {
                headers: { authorization: header },
            };
            const res = response();
            let called = false;
            Reflect.apply(optionalAuth, undefined, [
                req,
                res,
                () => {
                    called = true;
                },
            ]);
            expect(res.statusCode).toBe(status);
            expect(called).toBe(status === 0);
            expect(req.user?.id).toBe(user_id);
        }
    });
});
