import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import type { Request, Response } from "express";

import { prisma } from "@solmarket/database";
import ReportCommentController from "./controller.report-comment";
const suffix = crypto.randomUUID();
const user_a = `report-test-a-${suffix}`;
const user_b = `report-test-b-${suffix}`;
const comment_a = `report-test-a-${suffix}`;
const comment_b = `report-test-b-${suffix}`;
const user_ids = [user_a, user_b];
const comment_ids = [comment_a, comment_b];

async function report(comment_id: string, user_id: string) {
    let status = 0;
    let data: { alreadyReported: boolean } | undefined;
    const req: Request = Object.assign(Object.create(null), {
        user: { id: user_id },
        params: { id: comment_id },
    });
    const res: Response = Object.assign(Object.create(null), {
        status(code: number) {
            status = code;
            return this;
        },
        json(body: { data?: { alreadyReported: boolean } }) {
            data = body.data;
            return this;
        },
    });
    await ReportCommentController.process(req, res);
    return { status, data };
}

describe("comment reporting", () => {
    beforeAll(async () => {
        await prisma.user.createMany({
            data: user_ids.map((id) => ({ id, email: `${id}@example.com` })),
        });
        await prisma.comment.createMany({
            data: comment_ids.map((id) => ({
                id,
                eventId: `event-${suffix}`,
                userId: user_a,
                body: "test comment",
            })),
        });
    });

    afterAll(async () => {
        await prisma.comment.deleteMany({ where: { id: { in: comment_ids } } });
        await prisma.user.deleteMany({ where: { id: { in: user_ids } } });
        await prisma.$disconnect();
    });

    it("counts concurrent and repeated reports once", async () => {
        const results = await Promise.all(
            Array.from({ length: 8 }, () => report(comment_a, user_a)),
        );
        expect(results.every((result) => result.status === 200)).toBe(true);
        expect(results.filter((result) => result.data?.alreadyReported === false)).toHaveLength(1);
        expect((await report(comment_a, user_a)).data?.alreadyReported).toBe(true);
        expect(
            (await prisma.comment.findUniqueOrThrow({ where: { id: comment_a } })).reportCount,
        ).toBe(1);
    });

    it("counts different users and comments independently", async () => {
        expect((await report(comment_a, user_b)).data?.alreadyReported).toBe(false);
        expect((await report(comment_b, user_a)).data?.alreadyReported).toBe(false);
        expect(
            (await prisma.comment.findUniqueOrThrow({ where: { id: comment_a } })).reportCount,
        ).toBe(2);
        expect(
            (await prisma.comment.findUniqueOrThrow({ where: { id: comment_b } })).reportCount,
        ).toBe(1);
    });

    it("returns not found for a missing comment", async () => {
        expect((await report(`missing-${suffix}`, user_a)).status).toBe(404);
    });

    it("rolls back the report when the count cannot be incremented", async () => {
        await prisma.comment.update({
            where: { id: comment_b },
            data: { reportCount: 2147483647 },
        });
        const log = spyOn(console, "error").mockImplementation(() => {});
        try {
            expect((await report(comment_b, user_b)).status).toBe(500);
        } finally {
            log.mockRestore();
        }
        expect(
            await prisma.commentReport.findUnique({
                where: { commentId_userId: { commentId: comment_b, userId: user_b } },
            }),
        ).toBeNull();
        await prisma.comment.update({ where: { id: comment_b }, data: { reportCount: 1 } });
        expect((await report(comment_b, user_b)).data?.alreadyReported).toBe(false);
        expect(
            (await prisma.comment.findUniqueOrThrow({ where: { id: comment_b } })).reportCount,
        ).toBe(2);
    });
});
