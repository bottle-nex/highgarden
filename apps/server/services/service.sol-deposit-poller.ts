import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
    createAssociatedTokenAccountInstruction,
    createMintToInstruction,
    getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import bs58 from "bs58";
import { prisma } from "@solmarket/database";
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
 * Periodically scans every user's custodial wallet for inbound SOL, and
 * when it sees a balance above the configured threshold:
 *
 *   1. Writes a `SolDeposit` row in `DETECTED` state.
 *   2. Submits a SystemProgram::transfer that moves SOL custodial → admin
 *      (admin pays the fee, so the entire user balance above the reserve
 *      sweeps). Updates row to `SWEEPING` then `SWEPT`.
 *   3. Mints USDC of equivalent value to the user's USDC ATA (creating
 *      the ATA if it doesn't exist). Admin keypair is the mint authority.
 *      Updates row to `COMPLETED`.
 *   4. On any failure, flips the row to `FAILED` with the error message
 *      truncated to 500 chars. Manual cleanup required by ops.
 *
 * Single-flight per tick — if the previous tick is still processing,
 * the new one returns immediately. In-flight rows per user (DETECTED /
 * SWEEPING / SWEPT) prevent a second deposit from being detected for
 * the same user mid-processing; the next tick after completion picks up
 * any additional SOL.
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
     * poll interval. Safe to call concurrently with the polling loop:
     * the in-flight check below makes it a no-op if the user already has
     * a deposit being processed.
     */
    public async check_now(user_id: string): Promise<{ detected: boolean }> {
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

    /**
     * Read balance → decide if it's a deposit → sweep + mint. Each user
     * is independent; one bad RPC doesn't block the rest of the tick.
     */
    private async check_one(c: Candidate): Promise<{ detected: boolean }> {
        const conn = this.get_connection();
        // Sweep reserve must be at least the rent-exempt minimum for a
        // 0-byte system account, otherwise SystemProgram::transfer rejects
        // with "account with insufficient funds for rent" — Solana doesn't
        // allow a system account to exist below rent-exempt minimum.
        const effective_reserve = Math.max(
            ENV.SERVER_DEPOSIT_SWEEP_RESERVE_LAMPORTS,
            await this.get_rent_exempt_min(),
        );
        const balance = await conn.getBalance(new PublicKey(c.custodialPublicKey), "confirmed");
        if (balance <= effective_reserve + ENV.SERVER_DEPOSIT_MIN_LAMPORTS) {
            return { detected: false };
        }

        // Cool-off after a recent FAILED row for this user. Without this
        // the poller would keep creating new FAILED rows every tick on a
        // persistent failure (e.g. CoinGecko outage, mint authority bug).
        const recent_failure = await prisma.solDeposit.findFirst({
            where: {
                userId: c.userId,
                status: "FAILED",
                createdAt: { gte: new Date(Date.now() - 5 * 60_000) },
            },
            select: { id: true },
        });
        if (recent_failure) return { detected: false };

        // Don't pick up the same wallet twice while a deposit is mid-flow.
        // Status row gates concurrency at the per-user level so a second
        // tick before completion does nothing.
        const in_flight = await prisma.solDeposit.findFirst({
            where: { userId: c.userId, status: { in: ["DETECTED", "SWEEPING", "SWEPT"] } },
            select: { id: true },
        });
        if (in_flight) return { detected: false };

        const sweepable = balance - effective_reserve;
        await this.process_deposit(c, sweepable);
        return { detected: true };
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

    private async process_deposit(c: Candidate, lamports_to_sweep: number): Promise<void> {
        // Lock the rate in BEFORE any on-chain work so a slow CoinGecko
        // round-trip doesn't push us into stale-price territory mid-sweep.
        const rate_cents = await this.price_feed.get_sol_usd_rate_cents();
        const usdc_raw = this.compute_usdc_raw(lamports_to_sweep, rate_cents);

        const row = await prisma.solDeposit.create({
            data: {
                userId: c.userId,
                custodialPubkey: c.custodialPublicKey,
                solLamports: BigInt(lamports_to_sweep),
                solUsdRateCents: rate_cents,
                usdcMintedRaw: usdc_raw,
                status: "DETECTED",
            },
            select: { id: true },
        });

        try {
            const custodial_keypair = await this.load_custodial_keypair(c.userId);
            const admin = this.get_admin_keypair();

            const { signature: sweep_sig, blockhash: sweep_blockhash, lastValidBlockHeight: sweep_lvbh } =
                await this.sweep_sol(custodial_keypair, admin, lamports_to_sweep);
            await prisma.solDeposit.update({
                where: { id: row.id },
                data: { status: "SWEEPING", sweepTxSig: sweep_sig },
            });
            await this.get_connection().confirmTransaction(
                { signature: sweep_sig, blockhash: sweep_blockhash, lastValidBlockHeight: sweep_lvbh },
                "confirmed",
            );
            await prisma.solDeposit.update({
                where: { id: row.id },
                data: { status: "SWEPT" },
            });

            const mint_sig = await this.mint_usdc(
                admin,
                new PublicKey(c.custodialPublicKey),
                usdc_raw,
            );
            await prisma.solDeposit.update({
                where: { id: row.id },
                data: {
                    status: "COMPLETED",
                    mintTxSig: mint_sig,
                    completedAt: new Date(),
                },
            });
            console.log(
                `[sol-deposit-poller] credited user=${c.userId} sol=${lamports_to_sweep} usdc_raw=${usdc_raw} sweep=${sweep_sig.slice(0, 8)} mint=${mint_sig.slice(0, 8)}`,
            );
        } catch (err) {
            const msg = (err as Error)?.message ?? String(err);
            await prisma.solDeposit.update({
                where: { id: row.id },
                data: { status: "FAILED", error: msg.slice(0, 500) },
            });
            throw err;
        }
    }

    /**
     * BigInt math: lamports × rate_cents × 10_000 / 1e9.
     *   - lamports has 9 decimals → SOL
     *   - rate_cents has 2 decimals → USD (rate × 0.01 = USD/SOL)
     *   - 10_000 lifts cents into 6-decimal micro-USDC: cent × 10_000 = micro-USDC
     * Net: micro-USDC == (lamports × rate × 10_000) / 1e9.
     */
    private compute_usdc_raw(lamports: number, rate_cents: number): bigint {
        return (BigInt(lamports) * BigInt(rate_cents) * USDC_PER_CENT) / LAMPORTS_PER_SOL;
    }

    /**
     * Submits a SystemProgram::transfer custodial → admin. Admin pays the
     * tx fee (not the custodial wallet), so we can sweep the entire
     * balance above the configured reserve.
     */
    private async sweep_sol(
        custodial: Keypair,
        admin: Keypair,
        lamports: number,
    ): Promise<{ signature: string; blockhash: string; lastValidBlockHeight: number }> {
        const conn = this.get_connection();
        const tx = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: custodial.publicKey,
                toPubkey: admin.publicKey,
                lamports,
            }),
        );
        const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
        tx.recentBlockhash = blockhash;
        tx.feePayer = admin.publicKey;
        tx.sign(admin, custodial);
        const signature = await conn.sendRawTransaction(tx.serialize(), {
            preflightCommitment: "confirmed",
        });
        return { signature, blockhash, lastValidBlockHeight };
    }

    /**
     * Mints `usdc_raw` micro-USDC to the user's associated token account
     * for the configured USDC mint. Creates the ATA in the same tx if
     * it doesn't exist yet. Admin is the mint authority (set during
     * initialize-config) AND the fee payer.
     */
    private async mint_usdc(
        admin: Keypair,
        recipient: PublicKey,
        usdc_raw: bigint,
    ): Promise<string> {
        const conn = this.get_connection();
        const mint = new PublicKey(ENV.SERVER_USDC_MINT);
        const ata = getAssociatedTokenAddressSync(mint, recipient);

        const tx = new Transaction();
        const ata_info = await conn.getAccountInfo(ata, "confirmed");
        if (!ata_info) {
            tx.add(
                createAssociatedTokenAccountInstruction(
                    admin.publicKey,
                    ata,
                    recipient,
                    mint,
                ),
            );
        }
        tx.add(createMintToInstruction(mint, ata, admin.publicKey, usdc_raw));

        const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
        tx.recentBlockhash = blockhash;
        tx.feePayer = admin.publicKey;
        tx.sign(admin);
        const sig = await conn.sendRawTransaction(tx.serialize(), {
            preflightCommitment: "confirmed",
        });
        await conn.confirmTransaction(
            { signature: sig, blockhash, lastValidBlockHeight },
            "confirmed",
        );
        return sig;
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
