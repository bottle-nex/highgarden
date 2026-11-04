import { randomUUID } from "node:crypto";
import { prisma } from "@solmarket/database";
import { sendNotificationEmail } from "./service.email";

export async function enqueueLoginAlert(email: string) {
    await prisma.notificationOutbox.create({
        data: {
            dedupeKey: `login:${randomUUID()}`,
            recipient: email,
            subject: "Successful sign-in to Solmarket",
            text: `A successful sign-in to your account occurred at ${new Date().toISOString()}. If this was not you, contact support immediately.`,
        },
    });
}

export async function drainNotifications() {
    const now = new Date();
    const rows = await prisma.notificationOutbox.findMany({
        where: {
            acceptedAt: null,
            availableAt: { lte: now },
            AND: [
                { OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
                { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
            ],
        },
        take: 25,
        orderBy: { availableAt: "asc" },
    });
    for (const row of rows) {
        const lease = new Date(Date.now() + 60000);
        const claimed = await prisma.notificationOutbox.updateMany({
            where: {
                id: row.id,
                acceptedAt: null,
                OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
            },
            data: { leaseUntil: lease, attempts: { increment: 1 } },
        });
        if (!claimed.count) continue;
        try {
            await sendNotificationEmail(row);
            await prisma.notificationOutbox.updateMany({
                where: { id: row.id, leaseUntil: lease },
                data: { acceptedAt: new Date(), leaseUntil: null },
            });
        } catch (err) {
            console.error("[notification-outbox]", row.id, err);
            await prisma.notificationOutbox.updateMany({
                where: { id: row.id, leaseUntil: lease },
                data: {
                    leaseUntil: null,
                    availableAt: new Date(
                        Date.now() + Math.min(3600000, 10000 * 2 ** Math.min(row.attempts, 10)),
                    ),
                },
            });
        }
    }
}
