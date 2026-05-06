import { Connection, PublicKey } from "@solana/web3.js";
import { ENV } from "../config/env";

export default class SolanaConnectionFactory {
    private static rpc: Connection | null = null;
    private static program_id: PublicKey | null = null;

    public static get_rpc(): Connection {
        if (!this.rpc) {
            this.rpc = new Connection(ENV.HEDGER_SOLANA_RPC_URL, {
                commitment: ENV.HEDGER_SOLANA_COMMITMENT,
                wsEndpoint: ENV.HEDGER_SOLANA_RPC_WS_URL,
            });
        }
        return this.rpc;
    }

    public static get_program_id(): PublicKey {
        if (!this.program_id) {
            this.program_id = new PublicKey(ENV.HEDGER_SOLANA_PROGRAM_ID);
        }
        return this.program_id;
    }
}
