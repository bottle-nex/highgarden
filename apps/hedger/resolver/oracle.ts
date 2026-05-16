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

    /** Sends a resolve_market instruction. Caller is responsible for
     *  passing the on-chain market PDA and the winning outcome. Throws
     *  on transient RPC failures so the caller can decide whether to
     *  retry (the periodic Resolver does; the fast-path falls back to
     *  it on failure). */
    static async resolve(market_pda: string, winning_outcome: Outcome): Promise<string> {
        const client = this.get_client();
        const outcome_int = winning_outcome === "YES" ? 0 : 1;
        return client.resolveMarket({
            oracleSigner: this.get_keypair().publicKey,
            market: new PublicKey(market_pda),
            winningOutcome: outcome_int as 0 | 1,
        });
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
