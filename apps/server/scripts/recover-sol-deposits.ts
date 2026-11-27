import {
    Connection,
    PublicKey,
    SystemProgram,
    type ParsedTransactionWithMeta,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { prisma, type Prisma, type SolDeposit } from "@solmarket/database";
import { z } from "zod";
import { file } from "bun";
import EnvService, { ENV } from "../config/config.env";

const evidence_schema = z
    .array(
        z.object({
            depositId: z.string().min(1),
            sweepTxSig: z.string().optional(),
            mintTxSig: z.string().optional(),
        }),
    )
    .refine(
        (rows) => new Set(rows.map((row) => row.depositId)).size === rows.length,
        "duplicate deposit evidence",
    );

type Evidence = z.infer<typeof evidence_schema>[number];

function has_mint(
    tx: ParsedTransactionWithMeta,
    row: SolDeposit,
    mint: string,
    admin: string,
): boolean {
    const ata = getAssociatedTokenAddressSync(
        new PublicKey(mint),
        new PublicKey(row.custodialPubkey),
    ).toBase58();
    return tx.transaction.message.instructions.some((ix) => {
        if (!ix.programId.equals(TOKEN_PROGRAM_ID) || !("parsed" in ix)) return false;
        const parsed = ix.parsed;
        return (
            parsed.type === "mintTo" &&
            parsed.info.mint === mint &&
            parsed.info.account === ata &&
            parsed.info.mintAuthority === admin &&
            parsed.info.amount === row.usdcMintedRaw.toString()
        );
    });
}

/**
 * Read-only evidence audit. Stop all pre-journal server processes before
 * applying results: their unrecorded transactions must no longer be sendable.
 * Requires an RPC with complete finalized address/transaction history.
 */
export async function audit_legacy_deposit(
    connection: Connection,
    row: SolDeposit,
    evidence: Evidence | undefined,
    mint: string,
    admin: string,
): Promise<Prisma.SolDepositUpdateInput> {
    if (row.recoveryReady) throw new Error("deposit already uses durable recovery");
    const sweep_signature = evidence?.sweepTxSig ?? row.sweepTxSig;
    if (!sweep_signature)
        throw new Error("missing sweep signature; verified transaction mapping required");
    const sweep = await connection.getParsedTransaction(sweep_signature, {
        commitment: "finalized",
        maxSupportedTransactionVersion: 0,
    });
    if (!sweep?.meta) throw new Error("finalized sweep evidence unavailable");
    const transfer = sweep.transaction.message.instructions.some((ix) => {
        if (!ix.programId.equals(SystemProgram.programId) || !("parsed" in ix)) return false;
        const parsed = ix.parsed;
        return (
            parsed.type === "transfer" &&
            parsed.info.source === row.custodialPubkey &&
            parsed.info.destination === admin &&
            Number.isSafeInteger(parsed.info.lamports) &&
            BigInt(parsed.info.lamports) === row.solLamports
        );
    });
    if (!transfer || sweep.transaction.message.accountKeys[0]?.pubkey.toBase58() !== admin) {
        throw new Error("sweep instructions, amount or fee payer do not match deposit");
    }
    if (sweep.meta.err) {
        // No SOL was taken by this transaction. Do not create a new obligation.
        return {
            status: "FAILED",
            error: "Legacy sweep failed on chain; no automatic credit",
            recoveryReady: false,
        };
    }
    if ((await connection.getFirstAvailableBlock()) > sweep.slot) {
        throw new Error("complete mint history unavailable; archival RPC required");
    }
    const root = await connection.getSlot("finalized");
    const ata = getAssociatedTokenAddressSync(
        new PublicKey(mint),
        new PublicKey(row.custodialPubkey),
    );
    const candidates = new Set<string>();
    let before: string | undefined;
    for (;;) {
        const page = await connection.getSignaturesForAddress(
            ata,
            { before, limit: 1000, minContextSlot: root },
            "finalized",
        );
        for (const entry of page) {
            if (entry.slot < sweep.slot || entry.err) continue;
            const tx = await connection.getParsedTransaction(entry.signature, {
                commitment: "finalized",
                maxSupportedTransactionVersion: 0,
            });
            if (!tx?.meta) throw new Error("mint history contains an unavailable transaction");
            if (!tx.meta.err && has_mint(tx, row, mint, admin)) candidates.add(entry.signature);
        }
        const last = page.at(-1);
        if (!last || last.slot < sweep.slot || page.length < 1000) break;
        if (before === last.signature) throw new Error("mint history pagination did not advance");
        before = last.signature;
    }
    const mint_signature = evidence?.mintTxSig ?? row.mintTxSig;
    if (candidates.size > 0 && (!mint_signature || !candidates.has(mint_signature))) {
        throw new Error(
            `possible existing credits (${[...candidates].join(", ")}); explicit mint mapping required`,
        );
    }
    // A supplied signature must itself be verified, even if the address index
    // returned no entries. Missing/pruned evidence must never authorize a mint.
    if (mint_signature && !candidates.has(mint_signature)) {
        const tx = await connection.getParsedTransaction(mint_signature, {
            commitment: "finalized",
            maxSupportedTransactionVersion: 0,
        });
        if (!tx?.meta || !has_mint(tx, row, mint, admin) || tx.slot < sweep.slot) {
            throw new Error("mint signature does not prove this deposit's credit");
        }
        if (!tx.meta.err) candidates.add(mint_signature);
    }
    return {
        recoveryReady: true,
        usdcMint: mint,
        sweepDestination: admin,
        sweepTxSig: sweep_signature,
        sweepSlot: sweep.slot,
        mintTxSig: mint_signature && candidates.has(mint_signature) ? mint_signature : null,
        status: mint_signature && candidates.has(mint_signature) ? "COMPLETED" : "SWEPT",
        completedAt:
            mint_signature && candidates.has(mint_signature)
                ? (row.completedAt ?? new Date())
                : null,
        error: null,
    };
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const value = (flag: string) => {
        const index = args.indexOf(flag);
        return index < 0 ? undefined : args[index + 1];
    };
    const mint_arg = value("--mint");
    const admin_arg = value("--admin");
    if (!mint_arg || !admin_arg) {
        throw new Error(
            "usage: bun scripts/recover-sol-deposits.ts --mint <historical-mint> --admin <historical-admin> [--evidence <json>] [--apply]. Stop pre-journal servers before --apply.",
        );
    }
    const mint = new PublicKey(mint_arg).toBase58();
    const admin = new PublicKey(admin_arg).toBase58();
    const evidence_path = value("--evidence");
    const evidence = evidence_path ? evidence_schema.parse(await file(evidence_path).json()) : [];
    const mappings = new Map(evidence.map((entry) => [entry.depositId, entry]));
    const apply = args.includes("--apply");
    EnvService.parse_env();
    const connection = new Connection(ENV.SERVER_SOLANA_RPC_URL, "finalized");
    const rows = await prisma.solDeposit.findMany({
        // The old confirmation bug could also label a failed mint COMPLETED.
        where: { recoveryReady: false },
        orderBy: { createdAt: "asc" },
    });
    let unresolved = 0;
    for (const row of rows) {
        try {
            const result = await audit_legacy_deposit(
                connection,
                row,
                mappings.get(row.id),
                mint,
                admin,
            );
            if (apply) {
                await prisma.$transaction(async (tx) => {
                    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${row.userId} FOR UPDATE`;
                    await tx.$queryRaw`SELECT "id" FROM "SolDeposit" WHERE "id" = ${row.id} FOR UPDATE`;
                    const current = await tx.solDeposit.findUniqueOrThrow({
                        where: { id: row.id },
                    });
                    if (
                        current.recoveryReady ||
                        current.sweepTxSig !== row.sweepTxSig ||
                        current.mintTxSig !== row.mintTxSig
                    ) {
                        throw new Error("deposit changed during audit; audit it again");
                    }
                    await tx.solDeposit.update({ where: { id: row.id }, data: result });
                });
            }
            console.log(
                JSON.stringify({ depositId: row.id, mode: apply ? "applied" : "audit", result }),
            );
        } catch (err) {
            unresolved += 1;
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[recover-sol-deposits] ${row.id}: ${message}`);
            if (apply) {
                await prisma.solDeposit.updateMany({
                    where: { id: row.id, recoveryReady: false, status: { not: "COMPLETED" } },
                    data: { status: "FAILED", error: message.slice(0, 500) },
                });
            }
        }
    }
    if (unresolved) process.exitCode = 1;
}

if (import.meta.main) {
    main()
        .catch((err) => {
            console.error("[recover-sol-deposits]", err);
            process.exitCode = 1;
        })
        .finally(() => prisma.$disconnect());
}
