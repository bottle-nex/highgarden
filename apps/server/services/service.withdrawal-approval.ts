import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { prisma } from "@solmarket/database";
import { ENV } from "../config/config.env";

export function amountUnits(amount: number): bigint {
    const units = Math.round(amount * 1000000);
    if (
        !Number.isFinite(amount) ||
        amount < 1 ||
        !Number.isSafeInteger(units) ||
        units / 1000000 !== amount
    ) {
        throw new Error("Amount must be at least 1 USDC and have at most six decimals");
    }
    return BigInt(units);
}

export function approvalHash(
    id: string,
    userId: string,
    destination: string,
    units: bigint,
    code: string,
) {
    return createHmac("sha256", ENV.SERVER_AUTH_SECRET)
        .update(JSON.stringify(["withdrawal-v1", id, userId, destination, units.toString(), code]))
        .digest("hex");
}

export async function requestWithdrawal(userId: string, destination: string, amount: number) {
    const units = amountUnits(amount);
    const address = new PublicKey(destination).toBase58();
    const id = randomUUID();
    const code = randomInt(0, 1000000).toString().padStart(6, "0");
    return prisma.$transaction(async (tx) => {
        // A user row lock serializes issuance across all server processes.
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
        if (address === user.custodialPublicKey)
            throw new Error("Cannot send to your own deposit address");
        const latest = await tx.withdrawalIntent.findFirst({
            where: { userId },
            orderBy: { createdAt: "desc" },
        });
        if (latest && Date.now() - latest.createdAt.getTime() < 60000)
            throw new Error("Wait 60 seconds before requesting another code");
        await tx.withdrawalIntent.updateMany({
            where: { userId, status: "AWAITING_APPROVAL" },
            data: { status: "CANCELLED" },
        });
        const expiresAt = new Date(Date.now() + 600000);
        const intent = await tx.withdrawalIntent.create({
            data: {
                id,
                userId,
                destination: address,
                amountUnits: units,
                expiresAt,
                approvalHash: approvalHash(id, userId, address, units, code),
            },
        });
        await tx.notificationOutbox.create({
            data: {
                dedupeKey: `withdrawal-approval:${id}`,
                recipient: user.email,
                expiresAt,
                subject: "Approve your Solmarket withdrawal",
                text: `Your withdrawal code is ${code}. It approves exactly ${units.toString()} micro-USDC (${amount} USDC) to ${address}. Expires in 10 minutes. Never share this code. If you did not request this, do not approve it.`,
            },
        });
        return publicIntent(intent);
    });
}

export async function confirmWithdrawal(userId: string, id: string, code: string) {
    const result = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "WithdrawalIntent" WHERE id = ${id} AND "userId" = ${userId} FOR UPDATE`;
        const intent = await tx.withdrawalIntent.findFirst({ where: { id, userId } });
        if (!intent) return { error: "Withdrawal not found" };
        if (["APPROVED", "SIGNED", "CONFIRMED"].includes(intent.status)) return { intent };
        if (
            intent.status !== "AWAITING_APPROVAL" ||
            intent.expiresAt <= new Date() ||
            intent.attempts >= 5
        ) {
            return { error: "Approval expired or locked. Request a fresh code." };
        }
        const hash = approvalHash(id, userId, intent.destination, intent.amountUnits, code);
        const matches =
            /^\d{6}$/.test(code) &&
            timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(intent.approvalHash, "hex"));
        const updated = await tx.withdrawalIntent.update({
            where: { id },
            data: {
                attempts: { increment: 1 },
                ...(matches ? { status: "APPROVED", approvalHash: "" } : {}),
            },
        });
        return matches ? { intent: updated } : { error: "Invalid withdrawal code" };
    });
    // Throw outside the transaction so failed attempts are committed.
    if (result.error || !result.intent) throw new Error(result.error);
    return result.intent;
}

export async function withdrawalStatus(userId: string, id: string) {
    const intent = await prisma.withdrawalIntent.findFirst({ where: { id, userId } });
    if (!intent) throw new Error("Withdrawal not found");
    return publicIntent(intent);
}

export function publicIntent(intent: {
    id: string;
    destination: string;
    amountUnits: bigint;
    status: string;
    txSignature: string | null;
    expiresAt: Date;
    createdAt: Date;
    failure: string | null;
}) {
    return {
        id: intent.id,
        destination: intent.destination,
        uiAmount: Number(intent.amountUnits) / 1000000,
        status: intent.status,
        txSignature: intent.txSignature,
        expiresAt: intent.expiresAt.toISOString(),
        resendAt: new Date(intent.createdAt.getTime() + 60000).toISOString(),
        failure: intent.failure,
    };
}
