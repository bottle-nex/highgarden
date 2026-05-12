import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import bs58 from "bs58";
import { prisma } from "@solmarket/database";
import type { Outcome } from "@solmarket/database";
import { SolmarketClient } from "@solmarket/contract";
import { ENV } from "../config/config.env";
import { decrypt_secret_key } from "./service.crypto";

interface ResolvedMarketRow {
    solanaMarketPda: string;
    winningOutcome: Outcome | null;
}

export interface ClaimInput {
    userId: string;
    marketDbId: string;
}

export interface ClaimResult {
    txSignature: string;
    marketPda: string;
    userPubkey: string;
    /** Signature of the follow-up close_position tx, or null if it failed. */
    closePositionSignature: string | null;
}

export type ClaimErrorCode =
    | "USER_NO_WALLET"
    | "MARKET_NOT_FOUND"
    | "MARKET_NOT_LISTED_ON_SOLANA"
    | "MARKET_NOT_RESOLVED"
    | "MARKET_UMA_DISPUTE"
    | "NO_WINNING_SHARES"
    | "ALREADY_CLAIMED";

export class ClaimError extends Error {
    public readonly code: ClaimErrorCode;
    constructor(code: ClaimErrorCode, message: string) {
        super(message);
        this.code = code;
        this.name = "ClaimError";
    }
}

export default class SolanaClaimService {
    public async claim(input: ClaimInput): Promise<ClaimResult> {
        const user_keypair = await this.load_custodial_keypair(input.userId);
        const fee_payer = this.load_fee_payer_keypair();
        const market = await this.load_resolved_market(input.marketDbId);
        const market_pda = new PublicKey(market.solanaMarketPda);

        // The market must have a winning outcome locked in before we
        // can pick a side to drain. Status === RESOLVED with
        // winningOutcome === null is the UMA-blocked transitional state;
        // the load_resolved_market check above catches the pausedReason
        // path but a freshly-RESOLVED row could in theory get here mid
        // poller-tick. Guard explicitly.
        if (!market.winningOutcome) {
            throw new ClaimError(
                "MARKET_NOT_RESOLVED",
                "market hasn't been resolved with a winning outcome yet",
            );
        }

        // Already-claimed check: the Claim row is written synchronously
        // after a successful on-chain claim, so a second click that
        // reaches the server means the row already exists. Returning a
        // typed error here is cheaper than letting the chain reject
        // with NoWinningShares.
        await this.assert_not_claimed(input.userId, input.marketDbId, market.winningOutcome);

        const client = this.build_client(fee_payer);
        const user_usdc = getAssociatedTokenAddressSync(
            new PublicKey(ENV.SERVER_USDC_MINT),
            user_keypair.publicKey,
        );

        // Read the on-chain UserPosition BEFORE claim so we know how many
        // shares we're about to redeem (claim zeroes them out). Stashed
        // into the Claim row below so PortfolioService can show
        // "$X claimed" without re-aggregating Fills.
        const winning_shares = await this.read_winning_shares(
            client,
            user_keypair.publicKey,
            market_pda,
            market.winningOutcome,
        );
        // User is on the losing side, or sold everything before resolution.
        // Either way no on-chain shares to drain — return a typed error
        // instead of letting the chain reject with NoWinningShares (6014).
        if (winning_shares <= 0) {
            throw new ClaimError(
                "NO_WINNING_SHARES",
                `you don't hold any winning shares for this market`,
            );
        }

        const sig = await client.claim({
            user: user_keypair.publicKey,
            userKeypair: user_keypair,
            feePayer: fee_payer,
            market: market_pda,
            userUsdc: user_usdc,
        });

        // Persist the Claim row immediately so a refresh of /portfolio
        // hides this position. Unique-keyed on (userId, marketId, outcome)
        // — a P2002 here means a previous claim was retried after the
        // on-chain tx landed but the DB write failed, which is fine to
        // ignore (the user got their USDC either way).
        if (market.winningOutcome) {
            await this.persist_claim({
                userId: input.userId,
                marketId: input.marketDbId,
                outcome: market.winningOutcome,
                shares: winning_shares,
                txSignature: sig,
            });
        }

        // Best-effort cleanup: reclaim the position PDA's rent. The winning
        // shares were just zeroed by claim above, so close_position's
        // require!(winning_balance == 0) check passes. Failures here are
        // non-fatal — the user got their USDC, the position just stays
        // open until a future sweeper picks it up.
        const closeSig = await this.try_close_position(client, {
            user: user_keypair,
            feePayer: fee_payer,
            market: market_pda,
        });

        return {
            txSignature: sig,
            marketPda: market.solanaMarketPda,
            userPubkey: user_keypair.publicKey.toBase58(),
            closePositionSignature: closeSig,
        };
    }

    /**
     * Throws ALREADY_CLAIMED when the user already has a Claim row for
     * this (market, outcome). The Claim row is written synchronously
     * after the on-chain claim lands, so its presence is authoritative
     * evidence that another tx already drained the user's winning shares.
     */
    private async assert_not_claimed(
        user_id: string,
        market_id: string,
        outcome: Outcome,
    ): Promise<void> {
        const existing = await prisma.claim.findUnique({
            where: {
                userId_marketId_outcome: {
                    userId: user_id,
                    marketId: market_id,
                    outcome,
                },
            },
            select: { id: true },
        });
        if (existing) {
            throw new ClaimError(
                "ALREADY_CLAIMED",
                "you've already redeemed this market — refresh your portfolio to clear the stale row",
            );
        }
    }

    /**
     * Reads the on-chain UserPosition before we send `claim` so the Claim
     * row records the actual share count (and therefore the actual USDC
     * payout, since payout = shares × $1). Returns 0 on any RPC / decode
     * failure — the claim still goes through; we just lose the exact
     * count for the audit row.
     */
    private async read_winning_shares(
        client: SolmarketClient,
        user: PublicKey,
        market: PublicKey,
        winning_outcome: Outcome | null,
    ): Promise<number> {
        if (!winning_outcome) return 0;
        try {
            const pos = await client.fetchUserPosition(user, market);
            const raw = winning_outcome === "YES" ? pos.yesShares : pos.noShares;
            return Number(raw);
        } catch {
            return 0;
        }
    }

    private async persist_claim(args: {
        userId: string;
        marketId: string;
        outcome: Outcome;
        shares: number;
        txSignature: string;
    }): Promise<void> {
        try {
            await prisma.claim.create({
                data: {
                    userId: args.userId,
                    marketId: args.marketId,
                    outcome: args.outcome,
                    shares: args.shares,
                    // Payout is `shares × $1` (the on-chain `claim` handler
                    // multiplies by `USDC_DECIMALS_MULTIPLIER`), so in cents
                    // it's `shares × 100`.
                    payoutCents: args.shares * 100,
                    txSignature: args.txSignature,
                },
            });
        } catch (err) {
            const code = (err as { code?: string }).code;
            if (code === "P2002") return; // duplicate — claim retry after partial commit
            // Anything else: log loudly. The user already got their USDC
            // on-chain — failing the whole request would be worse than
            // leaving the Claim row out and letting the next refresh
            // re-show the position.
            console.error("[solana-claim/persist_claim]", err);
        }
    }

    private async try_close_position(
        client: SolmarketClient,
        args: { user: Keypair; feePayer: Keypair; market: PublicKey },
    ): Promise<string | null> {
        try {
            return await client.closePosition({
                user: args.user.publicKey,
                userKeypair: args.user,
                feePayer: args.feePayer,
                market: args.market,
            });
        } catch (err) {
            console.warn("[claim] close_position failed (non-fatal)", err);
            return null;
        }
    }

    private load_fee_payer_keypair(): Keypair {
        const encoded = ENV.SERVER_SOLANA_ADMIN_KEYPAIR;
        if (!encoded) {
            throw new Error(
                "SERVER_SOLANA_ADMIN_KEYPAIR not set — fee_payer is required for claim",
            );
        }
        const trimmed = encoded.trim();
        if (trimmed.startsWith("[")) {
            const arr = JSON.parse(trimmed) as number[];
            return Keypair.fromSecretKey(Uint8Array.from(arr));
        }
        return Keypair.fromSecretKey(bs58.decode(trimmed));
    }

    private async load_custodial_keypair(user_id: string): Promise<Keypair> {
        const row = await prisma.user.findUnique({
            where: { id: user_id },
            select: { custodialPublicKey: true, custodialSecretEncrypted: true },
        });
        if (!row?.custodialSecretEncrypted || !row.custodialPublicKey) {
            throw new ClaimError("USER_NO_WALLET", "user has no custodial wallet");
        }
        const seed = decrypt_secret_key(row.custodialSecretEncrypted);
        const keypair = Keypair.fromSeed(seed);
        if (keypair.publicKey.toBase58() !== row.custodialPublicKey) {
            throw new ClaimError(
                "USER_NO_WALLET",
                "custodial keypair mismatch — derived pubkey does not match stored pubkey",
            );
        }
        return keypair;
    }

    private async load_resolved_market(market_db_id: string): Promise<ResolvedMarketRow> {
        const row = await prisma.market.findUnique({
            where: { id: market_db_id },
            select: {
                solanaMarketPda: true,
                status: true,
                pausedReason: true,
                winningOutcome: true,
            },
        });
        if (!row) throw new ClaimError("MARKET_NOT_FOUND", "market not found");
        if (!row.solanaMarketPda) {
            throw new ClaimError("MARKET_NOT_LISTED_ON_SOLANA", "market has no on-chain PDA");
        }
        // When Polymarket has closed the market but the winning outcome is
        // not yet determinable (UMA dispute in progress), the hedger's
        // market-status poller flips us to PAUSED with reason="UMA_DISPUTE".
        // Catch it here so the user sees a meaningful message rather than
        // the on-chain `MarketNotResolved` code.
        if (row.status === "PAUSED" && row.pausedReason === "UMA_DISPUTE") {
            throw new ClaimError(
                "MARKET_UMA_DISPUTE",
                "this market is closed due to a Polymarket UMA dispute — claims will resume once it's resolved",
            );
        }
        // We don't strictly enforce row.status === RESOLVED here — the on-chain
        // contract will reject with MarketNotResolved if it isn't, and that
        // error bubbles up cleanly to the client.
        return {
            solanaMarketPda: row.solanaMarketPda,
            winningOutcome: row.winningOutcome,
        };
    }

    private build_client(_user_keypair: Keypair): SolmarketClient {
        const connection = new Connection(ENV.SERVER_SOLANA_RPC_URL, "confirmed");
        return new SolmarketClient({
            connection,
            programId: new PublicKey(ENV.SERVER_SOLANA_PROGRAM_ID),
        });
    }
}
