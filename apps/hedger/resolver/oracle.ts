import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { SolmarketClient } from "@solmarket/contract";
import type { Outcome } from "@solmarket/database";
import bs58 from "bs58";

import { ENV } from "../envs/env";

/**
 * Shared oracle client used by both the periodic Resolver (Stage 2 of
 * the long-form resolution pipeline) and the MarketStatusPoller's
 * fast-path (FAST_MOVING markets resolve inline in the same tick that
 * detected the polymarket close, so users don't see a stale "round
 * ended, can't claim yet" window between the two loops).
 *
 * Lazily constructs the SolmarketClient and parses the oracle keypair
 * from `HEDGER_SOLANA_ORACLE_SIGNER_KEYPAIR` on first call. Returns null
 * from `try_init` when the env var isn't configured, letting callers
 * degrade gracefully instead of crashing.
 */
export class SolanaResolveOracle {
    private static cached_keypair: Keypair | null = null;
    private static cached_client: SolmarketClient | null = null;

    /** True when HEDGER_SOLANA_ORACLE_SIGNER_KEYPAIR is set and the
     *  keypair parses. False otherwise — callers should fall back to
     *  the periodic Resolver loop, which logs the same warning. */
    static is_configured(): boolean {
        return !!ENV.HEDGER_SOLANA_ORACLE_SIGNER_KEYPAIR;
    }

    /** Read the immutable on-chain winner; RPC/decode failures propagate. */
    static async read_resolution(market_pda: string): Promise<Outcome | null> {
        const market = await this.get_client().fetchMarket(new PublicKey(market_pda));
        if (market.status !== "Resolved") return null;
        if (market.winningOutcome === 0) return "YES";
        if (market.winningOutcome === 1) return "NO";
        throw new Error("Resolved on-chain market has no valid winning outcome");
    }

    /** Recover an already-landed resolution before attempting a new submission. */
    static async resolve(
        market_pda: string,
        winning_outcome: Outcome,
    ): Promise<{ signature: string; winningOutcome: Outcome }> {
        const client = this.get_client();
        const settled = await this.read_resolution(market_pda);
        if (settled) return { signature: "recovered", winningOutcome: settled };
        const outcome_int = winning_outcome === "YES" ? 0 : 1;
        const signature = await client.resolveMarket({
            oracleSigner: this.get_keypair().publicKey,
            market: new PublicKey(market_pda),
            winningOutcome: outcome_int as 0 | 1,
        });
        return { signature, winningOutcome: winning_outcome };
    }

    private static get_client(): SolmarketClient {
        if (!this.cached_client) {
            const connection = new Connection(ENV.HEDGER_SOLANA_RPC_URL, "confirmed");
            this.cached_client = new SolmarketClient({
                connection,
                programId: new PublicKey(ENV.HEDGER_SOLANA_PROGRAM_ID),
                defaultSigner: this.get_keypair(),
            });
        }
        return this.cached_client;
    }

    private static get_keypair(): Keypair {
        if (!this.cached_keypair) {
            const encoded = ENV.HEDGER_SOLANA_ORACLE_SIGNER_KEYPAIR;
            if (!encoded) {
                throw new Error(
                    "HEDGER_SOLANA_ORACLE_SIGNER_KEYPAIR not set — call SolanaResolveOracle.is_configured() first",
                );
            }
            this.cached_keypair = this.parse_keypair(encoded);
        }
        return this.cached_keypair;
    }

    private static parse_keypair(encoded: string): Keypair {
        const trimmed = encoded.trim();
        if (trimmed.startsWith("[")) {
            const arr = JSON.parse(trimmed) as number[];
            return Keypair.fromSecretKey(Uint8Array.from(arr));
        }
        return Keypair.fromSecretKey(bs58.decode(trimmed));
    }
}
