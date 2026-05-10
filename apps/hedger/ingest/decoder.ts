import { EventLogDecoder, type OrderFilledEvent } from "@solmarket/contract";
import type SolanaClient from "../clients/solana";

export type { OrderFilledEvent };

/**
 * Pure log → typed event parser. Holds no I/O, no DB, no network — just
 * an `EventLogDecoder` configured with the program id. Both the websocket
 * listener and the catch-up poller delegate to this; keeping it as its
 * own class is what prevents the borsh / discriminator machinery from
 * leaking into either.
 *
 * Construction takes a `SolanaClient` rather than a raw program id so the
 * dependency arrow stays consistent with the rest of v2 — collaborators
 * in via constructor, no module-level singletons.
 */
export default class OrderFilledDecoder {
    private readonly decoder: EventLogDecoder;

    constructor(solana: SolanaClient) {
        this.decoder = new EventLogDecoder(solana.program_id);
    }

    /**
     * Decodes every `OrderFilled` event in a transaction's log array. Logs
     * that don't parse cleanly are skipped silently — the listener
     * survives one malformed event while still consuming the rest of the
     * batch.
     */
    public decode_logs(logs: string[]): OrderFilledEvent[] {
        return this.decoder.decode_order_filled(logs);
    }
}
