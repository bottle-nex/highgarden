import { Connection, PublicKey } from "@solana/web3.js";
import { ENV } from "../envs/env";

/**
 * Holds the long-lived Solana RPC handle plus the program id derived
 * once at boot. This class is *connection state*, not behavior — the
 * listener, poller, decoder, and admin-tx code all take an instance and
 * read `.connection` / `.program_id`.
 *
 * Rationale for funneling all RPC access through one instance: a single
 * `new Connection(...)` per process keeps the underlying websocket pool
 * shared. Constructing a fresh `Connection` per call (as v1 occasionally
 * did via static factories) silently leaks websockets.
 */
export default class SolanaClient {
  /** Live Solana RPC connection. Used for both HTTP and WS subscriptions. */
  public readonly connection: Connection;

  /** Cached `PublicKey` for the hedger program — listener / poller / decoder use this. */
  public readonly program_id: PublicKey;

  constructor() {
    this.program_id = new PublicKey(ENV.HEDGER_SOLANA_PROGRAM_ID);
    this.connection = new Connection(ENV.HEDGER_SOLANA_RPC_URL, {
      commitment: ENV.HEDGER_SOLANA_COMMITMENT,
      wsEndpoint: ENV.HEDGER_SOLANA_RPC_WS_URL,
    });
  }
}
