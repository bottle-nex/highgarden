import { prisma, type Prisma, type WalletActivity, type SolDeposit } from "@solmarket/database";
import { Side, Outcome, type ActivityDTO, type ActivityPageDTO } from "@solmarket/types";
import { Connection, SendTransactionError } from "@solana/web3.js";
import { TransactionConfirmationError, type BeforeBroadcast } from "@solmarket/contract";
import bs58 from "bs58";
import { ENV } from "../config/config.env";

export class ActivityQueryError extends Error {}
export class ActivityConflictError extends Error {}

interface ActivityInput {
    userId: string;
    kind: "TRADE" | "CLAIM" | "WITHDRAWAL";
    amountRaw: bigint;
    marketId?: string;
    marketName?: string;
    side?: "BUY" | "SELL";
    outcome?: "YES" | "NO";
    shares?: number;
    priceCents?: number;
    nonce?: string;
    destination?: string;
}

export interface ActivityQuery {
    cursor: { createdAt: Date; id: string } | null;
    limit: number;
    search: string;
}

export default class ActivityService {
    static parse_query(query: Record<string, unknown>): ActivityQuery {
        const limit = query.limit === undefined ? 40 : Number(query.limit);
        if (typeof query.limit !== "undefined" && typeof query.limit !== "string")
            throw new ActivityQueryError("Invalid limit");
        if (!Number.isInteger(limit) || limit < 1 || limit > 100)
            throw new ActivityQueryError("Limit must be between 1 and 100");
        if (query.search !== undefined && typeof query.search !== "string")
            throw new ActivityQueryError("Invalid search");
        const search = typeof query.search === "string" ? query.search.trim() : "";
        if (search.length > 200) throw new ActivityQueryError("Search is too long");
        let cursor: ActivityQuery["cursor"] = null;
        if (query.cursor !== undefined) {
            if (typeof query.cursor !== "string" || query.cursor.length > 1000)
                throw new ActivityQueryError("Invalid cursor");
            try {
                const value: unknown = JSON.parse(
                    Buffer.from(query.cursor, "base64url").toString(),
                );
                if (
                    !value ||
                    typeof value !== "object" ||
                    !("id" in value) ||
                    !("createdAt" in value) ||
                    typeof value.id !== "string" ||
                    !value.id ||
                    value.id.length > 200 ||
                    typeof value.createdAt !== "string" ||
                    !Number.isFinite(Date.parse(value.createdAt))
                )
                    throw new Error("Invalid cursor");
                cursor = { id: value.id, createdAt: new Date(value.createdAt) };
            } catch {
                throw new ActivityQueryError("Invalid cursor");
            }
        }
        return { limit, search, cursor };
    }

    static async list(user_id: string, query: ActivityQuery): Promise<ActivityPageDTO> {
        const { limit, cursor, search } = query;
        const filters: Prisma.WalletActivityWhereInput[] = [{ userId: user_id }];
        if (cursor)
            filters.push({
                OR: [
                    { createdAt: { lt: cursor.createdAt } },
                    { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                ],
            });
        if (search) {
            const kinds = ["DEPOSIT", "WITHDRAWAL", "CLAIM", "TRADE"] as const;
            filters.push({
                OR: [
                    { marketName: { contains: search, mode: "insensitive" } },
                    { destination: { contains: search, mode: "insensitive" } },
                    {
                        kind: {
                            in: kinds.filter((kind) =>
                                kind.toLowerCase().includes(search.toLowerCase()),
                            ),
                        },
                    },
                ],
            });
        }
        const rows = await prisma.walletActivity.findMany({
            where: { AND: filters },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: limit + 1,
        });
        const items = rows.slice(0, limit);
        const last = items.at(-1);
        return {
            items: items.map((row) => ActivityService.shape(row)),
            nextCursor:
                rows.length > limit && last
                    ? Buffer.from(
                          JSON.stringify({ id: last.id, createdAt: last.createdAt.toISOString() }),
                      ).toString("base64url")
                    : null,
        };
    }

    static explorer_url(signature: string): string | null {
        const rpc = ENV.SERVER_SOLANA_RPC_URL;
        const cluster = rpc.includes("devnet")
            ? "devnet"
            : rpc.includes("testnet")
              ? "testnet"
              : rpc.includes("mainnet")
                ? "mainnet-beta"
                : "custom";
        const query = new URLSearchParams({ cluster });
        // Custom RPC URLs can contain server credentials; never send them to a browser.
        if (cluster === "custom") return null;
        return `https://explorer.solana.com/tx/${encodeURIComponent(signature)}?${query}`;
    }

    static shape(row: WalletActivity): ActivityDTO {
        const signatures = [
            ...new Set(
                [row.sweepTxSig, row.txSignature].filter((sig): sig is string => sig !== null),
            ),
        ];
        return {
            id: row.id,
            kind: row.kind,
            status: row.status,
            amountRaw: row.amountRaw.toString(),
            unit: row.unit === "SOL" ? "SOL" : "USDC",
            convertedUsdcRaw: row.convertedUsdcRaw?.toString() ?? null,
            marketId: row.marketId,
            marketName: row.marketName,
            side: row.side === null ? null : row.side === "BUY" ? Side.BUY : Side.SELL,
            outcome: row.outcome === null ? null : row.outcome === "YES" ? Outcome.YES : Outcome.NO,
            destination: row.destination,
            createdAt: row.createdAt.toISOString(),
            completedAt: row.completedAt?.toISOString() ?? null,
            error: row.error,
            transactions: signatures.map((signature) => ({
                signature,
                url: ActivityService.explorer_url(signature),
            })),
        };
    }

    /** Only explicit rejection is failure. A lost RPC response remains pending. */
    static is_rejection(error: unknown): boolean {
        return (
            error instanceof TransactionConfirmationError || error instanceof SendTransactionError
        );
    }

    static async track(
        input: ActivityInput,
        send: (_before: BeforeBroadcast) => Promise<string>,
    ): Promise<string> {
        let source_key: string | null = null;
        let confirmed = false;
        try {
            const signature = await send(async (info) => {
                const txSignature = bs58.encode(info.signature);
                const sourceKey = `${input.kind.toLowerCase()}:${txSignature}`;
                await prisma.walletActivity.upsert({
                    where: { sourceKey },
                    update: {},
                    create: {
                        ...input,
                        sourceKey,
                        unit: "USDC",
                        txSignature,
                        blockhash: info.blockhash,
                        lastValidBlockHeight: info.lastValidBlockHeight,
                    },
                });
                source_key = sourceKey;
            });
            confirmed = true;
            if (source_key)
                await prisma.walletActivity.update({
                    where: { sourceKey: source_key },
                    data: { status: "DONE", completedAt: new Date(), error: null },
                });
            return signature;
        } catch (error) {
            if (source_key && !confirmed) {
                // If this write fails too, the durable pending row still permits recovery.
                try {
                    await prisma.walletActivity.updateMany({
                        where: { sourceKey: source_key, status: "PENDING" },
                        data: {
                            ...(ActivityService.is_rejection(error)
                                ? { status: "FAILED", completedAt: new Date() }
                                : {}),
                            error: (error instanceof Error ? error.message : String(error)).slice(
                                0,
                                500,
                            ),
                        },
                    });
                } catch (record_error) {
                    console.error("[activity/record-outcome]", record_error);
                }
            }
            throw error;
        }
    }

    static async transaction_status(
        connection: Connection,
        row: WalletActivity,
    ): Promise<"PENDING" | "DONE" | "FAILED"> {
        if (!row.txSignature) return "PENDING";
        const signature = row.txSignature;
        const read = async () =>
            (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true }))
                .value[0];
        let status = await read();
        if (
            status?.confirmationStatus === "confirmed" ||
            status?.confirmationStatus === "finalized"
        )
            return status.err ? "FAILED" : "DONE";
        if (status) return "PENDING";
        if (
            row.lastValidBlockHeight !== null &&
            (await connection.getBlockHeight("finalized")) > row.lastValidBlockHeight
        ) {
            // Check history again after establishing expiry, to avoid a boundary race.
            status = await read();
            if (!status) return "FAILED";
            if (
                status.confirmationStatus === "confirmed" ||
                status.confirmationStatus === "finalized"
            )
                return status.err ? "FAILED" : "DONE";
        }
        return "PENDING";
    }

    static deposit_data(row: SolDeposit) {
        return {
            sourceKey: `deposit:${row.id}`,
            userId: row.userId,
            kind: "DEPOSIT" as const,
            status:
                row.status === "COMPLETED"
                    ? ("DONE" as const)
                    : row.status === "FAILED"
                      ? ("FAILED" as const)
                      : ("PENDING" as const),
            amountRaw: row.solLamports,
            unit: "SOL",
            convertedUsdcRaw: row.usdcMintedRaw,
            depositId: row.id,
            txSignature: row.mintTxSig ?? row.sweepTxSig,
            sweepTxSig: row.sweepTxSig,
            error: row.error?.slice(0, 500) ?? null,
            bookkept: true,
            createdAt: row.createdAt,
            completedAt: row.completedAt,
        };
    }

    static async create_deposit(data: Prisma.SolDepositUncheckedCreateInput): Promise<SolDeposit> {
        return prisma.$transaction(async (tx) => {
            const row = await tx.solDeposit.create({ data });
            await tx.walletActivity.create({ data: ActivityService.deposit_data(row) });
            return row;
        });
    }

    /** Compare-and-set prevents two workers from broadcasting different stage transactions. */
    static async update_deposit(
        id: string,
        from: SolDeposit["status"],
        data: Prisma.SolDepositUpdateManyMutationInput,
        signed?: {
            signature: string;
            blockhash: string;
            lastValidBlockHeight: number;
            previousSignature: string | null;
        },
    ): Promise<void> {
        await prisma.$transaction(async (tx) => {
            if (signed) {
                const locked = await tx.walletActivity.updateMany({
                    where: {
                        depositId: id,
                        txSignature: signed.previousSignature,
                        status: "PENDING",
                    },
                    data: {
                        txSignature: signed.signature,
                        blockhash: signed.blockhash,
                        lastValidBlockHeight: signed.lastValidBlockHeight,
                    },
                });
                if (!locked.count)
                    throw new ActivityConflictError("Deposit stage already submitted");
            }
            const changed = await tx.solDeposit.updateMany({ where: { id, status: from }, data });
            if (!changed.count) throw new ActivityConflictError("Deposit stage already advanced");
            const row = await tx.solDeposit.findUniqueOrThrow({ where: { id } });
            await tx.walletActivity.upsert({
                where: { sourceKey: `deposit:${id}` },
                create: ActivityService.deposit_data(row),
                update: ActivityService.deposit_data(row),
            });
        });
    }
}
