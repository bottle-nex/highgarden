import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
    createAssociatedTokenAccountIdempotentInstruction,
    createMintToInstruction,
    getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import bs58 from "bs58";
import { prisma, type Prisma, type SolDeposit, type SolDepositAttempt } from "@solmarket/database";
import { ENV } from "../config/config.env";
import CoinGeckoPriceFeed from "./service.price-feed";

interface Candidate {
    userId: string;
    custodialPublicKey: string;
}

/** SOL has 9 decimals; USDC has 6. Converting at rate `r¢/SOL`:
 *      micro_usdc = (lamports × r × 10_000) / 1e9
 *  All math in BigInt to avoid float drift on small deposits. */
const LAMPORTS_PER_SOL = BigInt(1_000_000_000);
const USDC_PER_CENT = BigInt(10_000);

/**
 * Recover durable sweep/mint attempts before looking for new SOL. Every send
 * reuses bytes saved in PostgreSQL; only finalized failure or proven expiry
 * permits another signature. A pending credit never gates another deposit.
 */
export default class SolDepositPoller {
    private timer: ReturnType<typeof setInterval> | null = null;
    private running = false;
    private connection: Connection | null = null;
    private admin_keypair: Keypair | null = null;
    private warned_disabled = false;
    /** Cached `getMinimumBalanceForRentExemption(0)`. Set lazily because it
     *  requires an RPC roundtrip; the value is a network constant so we
     *  only ever fetch it once per process. */
    private rent_exempt_min_lamports: number | null = null;

    // eslint-disable-next-line no-unused-vars
    constructor(private readonly price_feed: CoinGeckoPriceFeed) {}

    public start(): void {
        if (this.timer) return;
        if (!ENV.SERVER_DEPOSIT_POLLER_ENABLED) {
            this.warn_disabled_once();
            return;
        }
        if (!ENV.SERVER_SOLANA_ADMIN_KEYPAIR) {
            console.warn(
                "[sol-deposit-poller] SERVER_SOLANA_ADMIN_KEYPAIR not set — cannot sweep / mint, skipping start",
            );
            return;
        }
        void this.tick();
        this.timer = setInterval(() => void this.tick(), ENV.SERVER_DEPOSIT_POLL_INTERVAL_MS);
        console.log(
            `[sol-deposit-poller] started (interval=${ENV.SERVER_DEPOSIT_POLL_INTERVAL_MS}ms reserve=${ENV.SERVER_DEPOSIT_SWEEP_RESERVE_LAMPORTS} lamports)`,
        );
    }

    public stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    /**
     * Manually trigger a single check for one user — used by the "I just
     * deposited, check now" endpoint so users don't have to wait the full
     * poll interval. Database locks serialize reservations and signed attempts
     * across manual requests, timer ticks and independent server processes.
     */
    public async check_now(user_id: string): Promise<{ detected: boolean }> {
        if (!ENV.SERVER_DEPOSIT_POLLER_ENABLED) return { detected: false };
        const row = await prisma.user.findUnique({
            where: { id: user_id },
            select: { id: true, custodialPublicKey: true },
        });
        if (!row?.custodialPublicKey) return { detected: false };
        return this.check_one({ userId: row.id, custodialPublicKey: row.custodialPublicKey });
    }

    /**
     * Single-flight tick. Hands every user with a custodial wallet to
     * `check_one`. Top-level try/catch keeps the timer alive across
     * transient failures (RPC down, etc.).
     */
    private async tick(): Promise<void> {
        if (this.running) return;
        this.running = true;
        try {
            const candidates = await this.list_candidates();
            for (const c of candidates) {
                try {
                    await this.check_one(c);
                } catch (err) {
                    console.error(
                        `[sol-deposit-poller] check failed for ${c.userId}`,
                        (err as Error)?.message ?? err,
                    );
                }
            }
        } catch (err) {
            console.error("[sol-deposit-poller] tick failed", err);
        } finally {
            this.running = false;
        }
    }

    private async list_candidates(): Promise<Candidate[]> {
        const users = await prisma.user.findMany({
            where: { custodialPublicKey: { not: null } },
            select: { id: true, custodialPublicKey: true },
        });
        return users.map((u) => ({
            userId: u.id,
            custodialPublicKey: u.custodialPublicKey!,
        }));
    }

    private async check_one(c: Candidate): Promise<{ detected: boolean }> {
        // Recovery must work even when the wallet is empty or pricing is down.
        const pending = await prisma.solDeposit.findMany({
            where: {
                userId: c.userId,
                recoveryReady: true,
                status: { in: ["DETECTED", "SWEEPING", "SWEPT"] },
            },
            orderBy: { createdAt: "asc" },
            select: { id: true },
        });
        for (const row of pending) await this.recover_one(row.id);

        const effective_reserve = Math.max(
            ENV.SERVER_DEPOSIT_SWEEP_RESERVE_LAMPORTS,
            await this.get_rent_exempt_min(),
        );
        // An empty/reserved wallet needs no quote. In particular, a completed
        // recovery must not turn into a price-feed error on the manual endpoint.
        if (
            (await this.available_lamports(prisma, c, effective_reserve)) <=
            BigInt(ENV.SERVER_DEPOSIT_MIN_LAMPORTS)
        )
            return { detected: false };
        const rate_cents = await this.price_feed.get_sol_usd_rate_cents();
        const created = await prisma.$transaction(async (tx) => {
            // Always lock User before SolDeposit, including stage transitions.
            // Balance observations happen inside this lock to avoid stale reads
            // creating duplicate reservations in another process.
            await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${c.userId} FOR UPDATE`;
            const available = await this.available_lamports(tx, c, effective_reserve);
            if (available <= BigInt(ENV.SERVER_DEPOSIT_MIN_LAMPORTS)) return null;
            return tx.solDeposit.create({
                data: {
                    userId: c.userId,
                    custodialPubkey: c.custodialPublicKey,
                    solLamports: available,
                    solUsdRateCents: rate_cents,
                    usdcMintedRaw: this.compute_usdc_raw(available, rate_cents),
                    usdcMint: ENV.SERVER_USDC_MINT,
                    sweepDestination: this.get_admin_keypair().publicKey.toBase58(),
                },
                select: { id: true },
            });
        });
        if (created) await this.recover_one(created.id);
        return { detected: created !== null };
    }

    private async available_lamports(
        db: Prisma.TransactionClient,
        c: Candidate,
        reserve: number,
    ): Promise<bigint> {
        const swept = await db.solDeposit.aggregate({
            where: { userId: c.userId },
            _max: { sweepSlot: true },
        });
        const balance = await this.get_connection().getBalanceAndContext(
            new PublicKey(c.custodialPublicKey),
            { commitment: "finalized", minContextSlot: swept._max.sweepSlot ?? undefined },
        );
        if (!Number.isSafeInteger(balance.value)) throw new Error("unsafe SOL balance");
        const reserved = await db.solDeposit.aggregate({
            where: {
                userId: c.userId,
                recoveryReady: true,
                status: { in: ["DETECTED", "SWEEPING"] },
            },
            _sum: { solLamports: true },
        });
        return BigInt(balance.value) - BigInt(reserve) - (reserved._sum.solLamports ?? 0n);
    }

    /**
     * Fetches `getMinimumBalanceForRentExemption(0)` once per process and
     * caches it. The value is a network-level constant set per epoch
     * (~890_880 lamports for a 0-byte system account on mainnet/devnet);
     * we never need to refetch within a single boot.
     */
    private async get_rent_exempt_min(): Promise<number> {
        if (this.rent_exempt_min_lamports !== null) {
            return this.rent_exempt_min_lamports;
        }
        const min = await this.get_connection().getMinimumBalanceForRentExemption(0);
        this.rent_exempt_min_lamports = min;
        return min;
    }

    private compute_usdc_raw(lamports: bigint, rate_cents: number): bigint {
        return (lamports * BigInt(rate_cents) * USDC_PER_CENT) / LAMPORTS_PER_SOL;
    }

    private async recover_one(deposit_id: string): Promise<void> {
        try {
            // At most one sweep and one mint per visit; never spin on failure.
            for (let stage = 0; stage < 2; stage += 1) {
                const row = await prisma.solDeposit.findUniqueOrThrow({
                    where: { id: deposit_id },
                });
                if (!row.recoveryReady || row.status === "COMPLETED" || row.status === "FAILED")
                    return;
                const attempt = await this.prepare_attempt(row);
                if (!attempt || !(await this.advance_attempt(row, attempt))) return;
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            // Never erase the last durable stage on a transport/DB failure.
            console.error(`[sol-deposit-poller] recovery failed for ${deposit_id}`, message);
            try {
                await prisma.solDeposit.updateMany({
                    where: { id: deposit_id, status: { not: "COMPLETED" } },
                    data: { error: message.slice(0, 500) },
                });
            } catch (write_error) {
                console.error(
                    `[sol-deposit-poller] could not record error for ${deposit_id}`,
                    write_error,
                );
            }
        }
    }

    private async prepare_attempt(row: SolDeposit): Promise<SolDepositAttempt | null> {
        const stage = row.status === "SWEPT" ? "MINT" : "SWEEP";
        const existing = await prisma.solDepositAttempt.findUnique({
            where: { depositId_activeStage: { depositId: row.id, activeStage: stage } },
        });
        if (existing) return existing;

        const admin = this.get_admin_keypair();
        if (row.sweepDestination !== admin.publicKey.toBase58() || !row.usdcMint) {
            throw new Error("deposit configuration differs from its locked destination/mint");
        }
        const transaction = new Transaction();
        const signers = [admin];
        if (stage === "SWEEP") {
            const custodial = await this.load_custodial_keypair(row.userId);
            if (custodial.publicKey.toBase58() !== row.custodialPubkey) {
                throw new Error("deposit custodial address changed");
            }
            transaction.add(
                SystemProgram.transfer({
                    fromPubkey: custodial.publicKey,
                    toPubkey: new PublicKey(row.sweepDestination),
                    lamports: row.solLamports,
                }),
            );
            signers.push(custodial);
        } else {
            const mint = new PublicKey(row.usdcMint);
            const recipient = new PublicKey(row.custodialPubkey);
            const ata = getAssociatedTokenAddressSync(mint, recipient);
            transaction.add(
                createAssociatedTokenAccountIdempotentInstruction(
                    admin.publicKey,
                    ata,
                    recipient,
                    mint,
                ),
                createMintToInstruction(mint, ata, admin.publicKey, row.usdcMintedRaw),
            );
        }
        const latest = await this.get_connection().getLatestBlockhashAndContext("finalized");
        transaction.recentBlockhash = latest.value.blockhash;
        transaction.feePayer = admin.publicKey;
        transaction.sign(...signers);
        if (!transaction.signature) throw new Error("deposit transaction is unsigned");
        const signature = bs58.encode(transaction.signature);
        const signed = transaction.serialize();

        return prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${row.userId} FOR UPDATE`;
            await tx.$queryRaw`SELECT "id" FROM "SolDeposit" WHERE "id" = ${row.id} FOR UPDATE`;
            const current = await tx.solDeposit.findUniqueOrThrow({ where: { id: row.id } });
            if (!current.recoveryReady || current.status !== row.status) return null;
            const active = await tx.solDepositAttempt.findUnique({
                where: { depositId_activeStage: { depositId: row.id, activeStage: stage } },
            });
            if (active) return active;
            const attempt = await tx.solDepositAttempt.create({
                data: {
                    depositId: row.id,
                    stage,
                    activeStage: stage,
                    signature,
                    signedTransaction: Uint8Array.from(signed),
                    blockhash: latest.value.blockhash,
                    lastValidBlockHeight: latest.value.lastValidBlockHeight,
                    preparedSlot: latest.context.slot,
                },
            });
            await tx.solDeposit.update({
                where: { id: row.id },
                data:
                    stage === "SWEEP"
                        ? { status: "SWEEPING", sweepTxSig: signature, error: null }
                        : { mintTxSig: signature, error: null },
            });
            return attempt;
        });
    }

    private async advance_attempt(row: SolDeposit, attempt: SolDepositAttempt): Promise<boolean> {
        if (attempt.outcome !== "PENDING") return attempt.outcome === "SUCCEEDED";
        const conn = this.get_connection();
        let status = (
            await conn.getSignatureStatuses([attempt.signature], { searchTransactionHistory: true })
        ).value[0];
        if (status?.confirmationStatus === "finalized") {
            return this.settle_attempt(
                row,
                attempt,
                status.err ? "FAILED" : "SUCCEEDED",
                status.slot,
                status.err ? JSON.stringify(status.err) : null,
            );
        }
        const height = await conn.getBlockHeight("finalized");
        if (height > attempt.lastValidBlockHeight) {
            // A nonfinalized observation is not proof of failure or absence.
            if (status) return false;
            if (!(await this.prove_expired(attempt))) return false;
            // Recheck after the finalized expiry observation, closing the race
            // where the first lookup preceded a late finalized execution.
            status = (
                await conn.getSignatureStatuses([attempt.signature], {
                    searchTransactionHistory: true,
                })
            ).value[0];
            if (status?.confirmationStatus === "finalized") {
                return this.settle_attempt(
                    row,
                    attempt,
                    status.err ? "FAILED" : "SUCCEEDED",
                    status.slot,
                    status.err ? JSON.stringify(status.err) : null,
                );
            }
            if (status) return false;
            await this.settle_attempt(
                row,
                attempt,
                "EXPIRED",
                null,
                "transaction expired without execution",
            );
            return false;
        }
        await conn.sendRawTransaction(Buffer.from(attempt.signedTransaction), {
            preflightCommitment: "finalized",
        });
        return false;
    }

    private async prove_expired(attempt: SolDepositAttempt): Promise<boolean> {
        const conn = this.get_connection();
        const block_config = {
            commitment: "finalized",
            transactionDetails: "none",
            rewards: false,
            maxSupportedTransactionVersion: 0,
        } as const;
        if ((await conn.getFirstAvailableBlock()) > attempt.preparedSlot) {
            throw new Error(
                "deposit transaction history unavailable; cannot safely replace attempt",
            );
        }
        // A null signature lookup alone cannot prove nonexecution. Scan the
        // finalized blocks in the validity window, retaining bounded progress
        // so an RPC outage or a long downtime cannot turn one tick into a wait.
        if (attempt.expirySlot === null) {
            const slot = await conn.getSlot("finalized");
            const block = await conn.getParsedBlock(slot, block_config);
            if (!block || block.blockHeight == null) {
                throw new Error("deposit expiry block evidence unavailable");
            }
            // Load-balanced RPC nodes may have different finalized roots.
            if (block.blockHeight <= attempt.lastValidBlockHeight) return false;
            await prisma.solDepositAttempt.updateMany({
                where: { id: attempt.id, outcome: "PENDING", expirySlot: null },
                data: { expirySlot: slot },
            });
        }
        const current = await prisma.solDepositAttempt.findUniqueOrThrow({
            where: { id: attempt.id },
        });
        if (current.expirySlot === null) return false;
        const start = (current.checkedThroughSlot ?? current.preparedSlot - 1) + 1;
        const end = start + 15;
        const slots = await conn.getBlocks(start, end, "finalized");
        const last_slot = slots.at(-1);
        // getBlocks may cap the range at a lagging backend's finalized root.
        // Neither an empty response nor the requested end proves coverage.
        if (last_slot === undefined) return false;
        const blocks = await Promise.all(
            slots.map((slot) => conn.getBlockSignatures(slot, "finalized")),
        );
        if (blocks.some((block) => block.signatures.includes(attempt.signature))) {
            throw new Error(
                "deposit transaction found in finalized history; awaiting execution result",
            );
        }
        const last_block = await conn.getParsedBlock(last_slot, block_config);
        if (!last_block || last_block.blockHeight == null) {
            throw new Error("deposit expiry block evidence unavailable");
        }
        const passed_expiry = last_block.blockHeight > attempt.lastValidBlockHeight;
        await prisma.solDepositAttempt.updateMany({
            where: { id: attempt.id, outcome: "PENDING" },
            data: {
                checkedThroughSlot: last_slot,
                ...(passed_expiry ? { expirySlot: last_slot } : {}),
            },
        });
        return passed_expiry;
    }

    private async settle_attempt(
        row: SolDeposit,
        attempt: SolDepositAttempt,
        outcome: "SUCCEEDED" | "FAILED" | "EXPIRED",
        slot: number | null,
        error: string | null,
    ): Promise<boolean> {
        return prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${row.userId} FOR UPDATE`;
            await tx.$queryRaw`SELECT "id" FROM "SolDeposit" WHERE "id" = ${row.id} FOR UPDATE`;
            const current = await tx.solDepositAttempt.findUniqueOrThrow({
                where: { id: attempt.id },
            });
            if (current.outcome !== "PENDING") return current.outcome === "SUCCEEDED";
            const succeeded = outcome === "SUCCEEDED";
            await tx.solDepositAttempt.update({
                where: { id: attempt.id },
                data: {
                    outcome,
                    finalizedSlot: slot,
                    activeStage: succeeded ? attempt.stage : null,
                    error: error?.slice(0, 500),
                },
            });
            await tx.solDeposit.update({
                where: { id: row.id },
                data: succeeded
                    ? attempt.stage === "SWEEP"
                        ? { status: "SWEPT", sweepSlot: slot, error: null }
                        : { status: "COMPLETED", completedAt: new Date(), error: null }
                    : { error: error?.slice(0, 500) },
            });
            return succeeded;
        });
    }

    private async load_custodial_keypair(user_id: string): Promise<Keypair> {
        const row = await prisma.user.findUnique({
            where: { id: user_id },
            select: { custodialPublicKey: true, custodialSecretEncrypted: true },
        });
        if (!row?.custodialSecretEncrypted || !row.custodialPublicKey) {
            throw new Error(`user ${user_id} has no custodial keypair`);
        }
        // Re-imported here (rather than at module top) so the test path
        // doesn't pull in the crypto module unless deposits are actively
        // being processed.
        const { decrypt_secret_key } = await import("./service.crypto");
        const seed = decrypt_secret_key(row.custodialSecretEncrypted);
        const keypair = Keypair.fromSeed(seed);
        if (keypair.publicKey.toBase58() !== row.custodialPublicKey) {
            throw new Error(
                `custodial keypair mismatch for ${user_id} — derived pubkey does not match stored pubkey`,
            );
        }
        return keypair;
    }

    private get_admin_keypair(): Keypair {
        if (!this.admin_keypair) {
            const encoded = ENV.SERVER_SOLANA_ADMIN_KEYPAIR;
            if (!encoded) throw new Error("SERVER_SOLANA_ADMIN_KEYPAIR not set");
            const trimmed = encoded.trim();
            if (trimmed.startsWith("[")) {
                this.admin_keypair = Keypair.fromSecretKey(
                    Uint8Array.from(JSON.parse(trimmed) as number[]),
                );
            } else {
                this.admin_keypair = Keypair.fromSecretKey(bs58.decode(trimmed));
            }
        }
        return this.admin_keypair;
    }

    private get_connection(): Connection {
        if (!this.connection) {
            this.connection = new Connection(ENV.SERVER_SOLANA_RPC_URL, "confirmed");
        }
        return this.connection;
    }

    private warn_disabled_once(): void {
        if (this.warned_disabled) return;
        this.warned_disabled = true;
        console.warn(
            "[sol-deposit-poller] SERVER_DEPOSIT_POLLER_ENABLED=false — auto-conversion disabled",
        );
    }
}
