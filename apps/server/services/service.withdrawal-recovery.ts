import { prisma } from "@solmarket/database";
import { Connection } from "@solana/web3.js";
import { ENV } from "../config/config.env";
import SolanaWithdrawService from "./service.solana-withdraw";

export async function recoverWithdrawal(id: string) {
    const now = new Date();
    const lease = new Date(Date.now() + 120000);
    const claimed = await prisma.withdrawalIntent.updateMany({
        where: {
            id,
            status: { in: ["APPROVED", "SIGNED"] },
            OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
        },
        data: { leaseUntil: lease },
    });
    if (!claimed.count) return;
    try {
        const current = await prisma.withdrawalIntent.findUniqueOrThrow({ where: { id } });
        if (current.status === "APPROVED") {
            try {
                await new SolanaWithdrawService().withdraw_usdc(id);
            } catch (err) {
                // Only a pre-submission failure is definite here. A stored signed
                // transaction must always be reconciled, never replaced.
                await prisma.withdrawalIntent.updateMany({
                    where: { id, status: "APPROVED", leaseUntil: lease },
                    data: {
                        status: "FAILED",
                        failure: err instanceof Error ? err.message : "Unable to prepare transfer",
                    },
                });
                return;
            }
        }
        const intent = await prisma.withdrawalIntent.findUniqueOrThrow({
            where: { id },
            include: { user: true },
        });
        if (intent.status !== "SIGNED" || !intent.txSignature || !intent.signedTransaction) return;
        const connection = new Connection(ENV.SERVER_SOLANA_RPC_URL, "confirmed");
        const check = await connection.getSignatureStatuses([intent.txSignature], {
            searchTransactionHistory: true,
        });
        const status = check.value[0];
        if (status?.err && status.confirmationStatus === "finalized") {
            await prisma.withdrawalIntent.updateMany({
                where: { id, status: "SIGNED", leaseUntil: lease },
                data: {
                    status: "FAILED",
                    failure: "Chain rejected the transfer. Request a fresh code.",
                },
            });
        } else if (status?.confirmationStatus === "finalized") {
            await prisma.$transaction(async (tx) => {
                const updated = await tx.withdrawalIntent.updateMany({
                    where: { id, status: "SIGNED", leaseUntil: lease },
                    data: { status: "CONFIRMED", confirmedAt: new Date() },
                });
                if (!updated.count) return;
                await tx.notificationOutbox.upsert({
                    where: { dedupeKey: `withdrawal-receipt:${id}` },
                    update: {},
                    create: {
                        dedupeKey: `withdrawal-receipt:${id}`,
                        recipient: intent.user.email,
                        subject: "Solmarket withdrawal confirmed",
                        text: `Your withdrawal of ${Number(intent.amountUnits) / 1000000} USDC to ${intent.destination} is confirmed. Transaction: ${intent.txSignature}`,
                    },
                });
            });
        } else if (!status) {
            // Re-broadcast only these exact bytes. Expired or unavailable results
            // remain pending; an RPC timeout is not proof that money did not move.
            await connection.sendRawTransaction(Buffer.from(intent.signedTransaction, "base64"), {
                skipPreflight: false,
            });
        }
    } catch (err) {
        console.error("[withdrawal-recovery] pending", id, err);
    } finally {
        await prisma.withdrawalIntent.updateMany({
            where: { id, leaseUntil: lease },
            data: { leaseUntil: null },
        });
    }
}

export async function recoverWithdrawals() {
    const rows = await prisma.withdrawalIntent.findMany({
        where: {
            status: { in: ["APPROVED", "SIGNED"] },
            OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
        },
        take: 25,
        orderBy: { createdAt: "asc" },
    });
    for (const row of rows) await recoverWithdrawal(row.id);
}
