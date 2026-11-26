import { afterAll, beforeAll, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import * as database from "@solmarket/database";
import { start_report_server } from "./report-comment.test-utils";

const database_exports = { ...database };
const find_comment = mock(async (): Promise<{ id: string } | null> => ({ id: "comment-1" }));
const insert_report = mock(async () => ({ count: 1 }));
const increment_count = mock(async () => ({}));
const tx = {
    comment: { findUnique: find_comment, update: increment_count },
    commentReport: { createMany: insert_report },
};
const transaction = mock(async <T>(work: (_client: typeof tx) => Promise<T>) => work(tx));

mock.module("@solmarket/database", () => ({
    ...database_exports,
    prisma: { $transaction: transaction },
}));
const { default: ReportCommentController } = await import("./controller.report-comment");

describe("report comment", () => {
    let server: Awaited<ReturnType<typeof start_report_server>>;

    beforeAll(async () => {
        server = await start_report_server(ReportCommentController.process);
    });
    afterAll(async () => {
        await server.close();
        mock.module("@solmarket/database", () => database_exports);
    });
    beforeEach(() => {
        transaction.mockClear();
        find_comment.mockReset();
        find_comment.mockResolvedValue({ id: "comment-1" });
        insert_report.mockReset();
        insert_report.mockResolvedValue({ count: 1 });
        increment_count.mockReset();
        increment_count.mockResolvedValue({});
    });

    it("records and increments a first report inside one transaction", async () => {
        const response = await server.report("user-1", "comment-1");
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            success: true,
            data: { reported: true, alreadyReported: false },
            message: "Comment reported",
        });
        expect(transaction).toHaveBeenCalledTimes(1);
        expect(find_comment).toHaveBeenCalledWith({
            where: { id: "comment-1" },
            select: { id: true },
        });
        expect(insert_report).toHaveBeenCalledWith({
            data: { userId: "user-1", commentId: "comment-1" },
            skipDuplicates: true,
        });
        expect(increment_count).toHaveBeenCalledWith({
            where: { id: "comment-1" },
            data: { reportCount: { increment: 1 } },
        });
    });

    it("returns success without incrementing an existing report", async () => {
        insert_report.mockResolvedValue({ count: 0 });
        const response = await server.report("user-1", "comment-1");
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            data: { reported: true, alreadyReported: true },
            message: "Already reported",
        });
        expect(increment_count).not.toHaveBeenCalled();
    });

    it("handles both outcomes of concurrent duplicate inserts", async () => {
        insert_report.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
        const responses = await Promise.all([
            server.report("user-1", "comment-1"),
            server.report("user-1", "comment-1"),
        ]);
        const bodies = await Promise.all(responses.map((response) => response.json()));
        expect(responses.map((response) => response.status)).toEqual([200, 200]);
        expect(bodies).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ data: { reported: true, alreadyReported: false } }),
                expect.objectContaining({ data: { reported: true, alreadyReported: true } }),
            ]),
        );
        expect(increment_count).toHaveBeenCalledTimes(1);
    });

    it("rejects unauthenticated and missing-id requests before database access", async () => {
        expect((await server.report(null, "comment-1")).status).toBe(401);
        expect((await server.report("user-1")).status).toBe(400);
        expect(transaction).not.toHaveBeenCalled();
    });

    it("returns not found without creating a report", async () => {
        find_comment.mockResolvedValue(null);
        const response = await server.report("user-1", "missing");
        expect(response.status).toBe(404);
        expect(await response.json()).toMatchObject({ message: "comment not found" });
        expect(insert_report).not.toHaveBeenCalled();
        expect(increment_count).not.toHaveBeenCalled();
    });

    it("surfaces an insert failure and never increments", async () => {
        insert_report.mockRejectedValueOnce(new Error("insert failed"));
        const log = spyOn(console, "error").mockImplementation(() => {});
        try {
            expect((await server.report("user-1", "comment-1")).status).toBe(500);
            expect(increment_count).not.toHaveBeenCalled();
            expect(log).toHaveBeenCalled();
        } finally {
            log.mockRestore();
        }
    });

    it("surfaces an increment failure and permits a later retry", async () => {
        increment_count.mockRejectedValueOnce(new Error("increment failed"));
        const log = spyOn(console, "error").mockImplementation(() => {});
        try {
            expect((await server.report("user-1", "comment-1")).status).toBe(500);
            const retry = await server.report("user-1", "comment-1");
            expect(retry.status).toBe(200);
            expect(await retry.json()).toMatchObject({ data: { alreadyReported: false } });
        } finally {
            log.mockRestore();
        }
    });
});
