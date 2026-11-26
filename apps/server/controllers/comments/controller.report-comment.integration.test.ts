import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { prisma } from "@solmarket/database";
import { z } from "zod";
import ReportCommentController from "./controller.report-comment";
import { start_report_server } from "./report-comment.test-utils";

// Run separately from the mocked controller tests, against a disposable database.
const report_response = z.object({
    data: z.object({ reported: z.literal(true), alreadyReported: z.boolean() }),
});

describe("report comment with PostgreSQL", () => {
    let server: Awaited<ReturnType<typeof start_report_server>>;
    let user_id: string;
    let other_user_id: string;
    let comment_id: string;
    let other_comment_id: string;

    beforeAll(async () => {
        const [database] = await prisma.$queryRaw<{ name: string }[]>`
            SELECT current_database() AS name
        `;
        if (!database?.name.startsWith("comment_report_test")) {
            throw new Error(
                "Integration tests require a disposable database named comment_report_test*",
            );
        }
        server = await start_report_server(ReportCommentController.process);
    });
    afterAll(async () => {
        await server?.close();
        await prisma.$disconnect();
    });
    beforeEach(async () => {
        user_id = crypto.randomUUID();
        other_user_id = crypto.randomUUID();
        comment_id = crypto.randomUUID();
        other_comment_id = crypto.randomUUID();
        await prisma.user.createMany({
            data: [user_id, other_user_id].map((id) => ({
                id,
                email: `${id}@report-test.example`,
            })),
        });
        await prisma.comment.createMany({
            data: [comment_id, other_comment_id].map((id) => ({
                id,
                userId: user_id,
                eventId: "report-test",
                body: "Comment reporting regression fixture",
            })),
        });
    });
    afterEach(async () => {
        await prisma.comment.deleteMany({ where: { id: { in: [comment_id, other_comment_id] } } });
        await prisma.user.deleteMany({ where: { id: { in: [user_id, other_user_id] } } });
    });

    it("counts simultaneous reports once across independent HTTP servers", async () => {
        const other_server = await start_report_server(ReportCommentController.process);
        try {
            const responses = await Promise.all(
                Array.from({ length: 20 }, (_, index) =>
                    (index % 2 ? server : other_server).report(user_id, comment_id),
                ),
            );
            expect(responses.every((response) => response.status === 200)).toBe(true);
            const bodies = await Promise.all(responses.map((response) => response.json()));
            const outcomes = bodies.map((body) => report_response.parse(body).data.alreadyReported);
            expect(outcomes.filter((already_reported) => !already_reported)).toHaveLength(1);
            expect(outcomes.filter((already_reported) => already_reported)).toHaveLength(19);
            expect(await prisma.commentReport.count({ where: { commentId: comment_id } })).toBe(1);
            const comment = await prisma.comment.findUniqueOrThrow({ where: { id: comment_id } });
            expect(comment.reportCount).toBe(1);
        } finally {
            await other_server.close();
        }
    });

    it("keeps a later duplicate idempotent and preserves historical counts", async () => {
        await prisma.comment.update({ where: { id: comment_id }, data: { reportCount: 3 } });
        const first = await server.report(user_id, comment_id);
        expect(first.status).toBe(200);
        expect(await first.json()).toMatchObject({ data: { alreadyReported: false } });
        const second = await server.report(user_id, comment_id);
        expect(second.status).toBe(200);
        expect(await second.json()).toMatchObject({ data: { alreadyReported: true } });
        const comment = await prisma.comment.findUniqueOrThrow({ where: { id: comment_id } });
        expect(comment.reportCount).toBe(4);
        expect(await prisma.commentReport.count({ where: { commentId: comment_id } })).toBe(1);
    });

    it("counts each distinct user and comment independently", async () => {
        const responses = await Promise.all([
            server.report(user_id, comment_id),
            server.report(other_user_id, comment_id),
            server.report(user_id, other_comment_id),
        ]);
        expect(responses.every((response) => response.status === 200)).toBe(true);
        const first = await prisma.comment.findUniqueOrThrow({ where: { id: comment_id } });
        const second = await prisma.comment.findUniqueOrThrow({ where: { id: other_comment_id } });
        expect(first.reportCount).toBe(2);
        expect(second.reportCount).toBe(1);
        expect(await prisma.commentReport.count({ where: { userId: user_id } })).toBe(2);
    });

    it("rolls back the report if incrementing fails, then accepts a retry", async () => {
        // PostgreSQL integer overflow fails the update after the report insert.
        await prisma.comment.update({
            where: { id: comment_id },
            data: { reportCount: 2_147_483_647 },
        });
        const log = spyOn(console, "error").mockImplementation(() => {});
        try {
            expect((await server.report(user_id, comment_id)).status).toBe(500);
        } finally {
            log.mockRestore();
        }
        expect(await prisma.commentReport.count({ where: { commentId: comment_id } })).toBe(0);
        const failed = await prisma.comment.findUniqueOrThrow({ where: { id: comment_id } });
        expect(failed.reportCount).toBe(2_147_483_647);

        await prisma.comment.update({ where: { id: comment_id }, data: { reportCount: 0 } });
        const retry = await server.report(user_id, comment_id);
        expect(retry.status).toBe(200);
        expect(await retry.json()).toMatchObject({ data: { alreadyReported: false } });
        expect(await prisma.commentReport.count({ where: { commentId: comment_id } })).toBe(1);
        const succeeded = await prisma.comment.findUniqueOrThrow({ where: { id: comment_id } });
        expect(succeeded.reportCount).toBe(1);
    });
});
