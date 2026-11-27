import { prisma, type WalletActivity } from "@solmarket/database";
import { Connection } from "@solana/web3.js";
import { ENV } from "../config/config.env";
import ActivityService from "./service.activity";

/** Resolves uncertain submissions and repairs successful trade/claim bookkeeping. Never resends. */
export default class ActivityReconciler {
    private timer: ReturnType<typeof setInterval> | null = null;
    private running = false;
    private connection: Connection | null = null;

    public start(): void {
        if (this.timer) return;
        this.connection = new Connection(ENV.SERVER_SOLANA_RPC_URL, "confirmed");
        this.timer = setInterval(() => void this.tick(), 15_000);
        void this.tick();
    }

    public stop(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    public async tick(): Promise<void> {
        if (this.running || !this.connection) return;
        this.running = true;
        try {
            // Deposit recovery owns its multi-stage transitions in SolDepositPoller.
            const rows = await prisma.walletActivity.findMany({
                where: {
                    kind: { not: "DEPOSIT" },
                    OR: [{ status: "PENDING" }, { status: "DONE", bookkept: false }],
                },
            });
            for (const row of rows) {
                try {
                    if (row.status === "PENDING") {
                        const status = await ActivityService.transaction_status(
                            this.connection,
                            row,
                        );
                        if (status === "PENDING") continue;
                        await prisma.walletActivity.updateMany({
                            where: { id: row.id, status: "PENDING" },
                            data: {
                                status,
                                completedAt: new Date(),
                                error:
                                    status === "FAILED"
                                        ? "Transaction failed or expired without confirmation"
                                        : null,
                            },
                        });
                        if (status === "FAILED") continue;
                    }
                    await this.repair_bookkeeping(row);
                } catch (error) {
                    console.error(`[activity/reconcile:${row.id}]`, error);
                }
            }
        } catch (error) {
            console.error("[activity/reconcile]", error);
        } finally {
            this.running = false;
        }
    }

    private async repair_bookkeeping(row: WalletActivity): Promise<void> {
        await prisma.$transaction(async (tx) => {
            if (
                row.kind === "TRADE" &&
                row.marketId &&
                row.side &&
                row.outcome &&
                row.shares !== null &&
                row.priceCents !== null &&
                row.txSignature
            ) {
                await tx.fill.upsert({
                    where: { solanaTxSig: row.txSignature },
                    update: {},
                    create: {
                        userId: row.userId,
                        marketId: row.marketId,
                        side: row.side,
                        outcome: row.outcome,
                        size: row.shares,
                        price: row.priceCents,
                        nonce: row.nonce,
                        solanaTxSig: row.txSignature,
                        createdAt: row.createdAt,
                    },
                });
                if (row.nonce)
                    await tx.quote.update({
                        where: { nonce: row.nonce },
                        data: { consumed: true },
                    });
            }
            if (
                row.kind === "CLAIM" &&
                row.marketId &&
                row.outcome &&
                row.shares !== null &&
                row.txSignature
            ) {
                await tx.claim.upsert({
                    where: {
                        userId_marketId_outcome: {
                            userId: row.userId,
                            marketId: row.marketId,
                            outcome: row.outcome,
                        },
                    },
                    update: {},
                    create: {
                        userId: row.userId,
                        marketId: row.marketId,
                        outcome: row.outcome,
                        shares: row.shares,
                        payoutCents: row.shares * 100,
                        txSignature: row.txSignature,
                        createdAt: row.createdAt,
                    },
                });
            }
            await tx.walletActivity.update({ where: { id: row.id }, data: { bookkept: true } });
        });
    }
}
