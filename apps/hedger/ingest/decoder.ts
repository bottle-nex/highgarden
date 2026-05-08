import { BorshCoder, EventParser } from "@coral-xyz/anchor";
import { IDL, type Contract } from "@solmarket/contract";
import { PublicKey } from "@solana/web3.js";
import type SolanaClient from "../clients/solana";

/**
 * The structured event emitted by the on-chain `OrderFilled` Anchor
 * event. This is the *boundary type* between everything below us
 * (Solana logs, base64, Borsh) and everything above (queue, hedger,
 * resolver). Once a log is decoded into this shape no other code
 * touches the raw Anchor wire format.
 *
 * `nonce` is the dedupe key — generated on-chain per fill — and is
 * what the queue uses as a job id (Phase 5).
 */
export interface OrderFilledEvent {
    user: PublicKey;
    market: PublicKey;
    polymarketMarketId: string;
    side: number;
    outcome: number;
    size: bigint;
    price: number;
    nonce: Buffer;
}

/**
 * Pure log → typed event parser. Holds no I/O, no DB, no network — just
 * an Anchor `EventParser` configured with the program's IDL. Both the
 * websocket listener and the catch-up poller delegate to this; keeping
 * it as its own class is what prevents the Borsh / IDL machinery from
 * leaking into either.
 *
 * Construction takes a `SolanaClient` rather than a raw program id so
 * the dependency arrow stays consistent with the rest of v2 —
 * collaborators in via constructor, no module-level singletons.
 */
export default class OrderFilledDecoder {
    private readonly parser: EventParser;

    constructor(solana: SolanaClient) {
        const coder = new BorshCoder(IDL as unknown as Contract);
        this.parser = new EventParser(solana.program_id, coder);
    }

    /**
     * Decodes every `OrderFilled` event in a transaction's log array. Logs
     * that aren't Anchor events, or are events of a different name, are
     * skipped silently. A single malformed event returns `null` from
     * {@link normalize} and is dropped — the rest of the batch survives.
     *
     * This swallow-on-bad-log behavior is one of v2's two intentional
     * exceptions to "let it crash." Anchor IDL versions drift; one bad
     * line shouldn't stop the listener from processing valid fills in the
     * same transaction.
     */
    public decode_logs(logs: string[]): OrderFilledEvent[] {
        const events: OrderFilledEvent[] = [];
        for (const ev of this.parser.parseLogs(logs)) {
            if (ev.name !== "OrderFilled" && ev.name !== "orderFilled") continue;
            const decoded = this.normalize(ev.data);
            if (decoded) events.push(decoded);
        }
        return events;
    }

    /**
     * Coerces Anchor's loosely-typed event payload into our strict
     * {@link OrderFilledEvent}. Anchor versions vary in what concrete
     * representation they hand back — sometimes `BN`, sometimes `bigint`,
     * sometimes byte arrays for buffers — so each field is funneled
     * through a small coercion helper.
     *
     * Returns `null` on any normalization failure; the caller drops null
     * results.
     */
    private normalize(data: Record<string, unknown>): OrderFilledEvent | null {
        try {
            const nonce = this.coerce_nonce(data["nonce"]);
            if (!nonce) return null;
            return {
                user: new PublicKey(data["user"] as PublicKey | string),
                market: new PublicKey(data["market"] as PublicKey | string),
                polymarketMarketId: String(
                    data["polymarketMarketId"] ?? data["polymarket_market_id"],
                ),
                side: Number(data["side"]),
                outcome: Number(data["outcome"]),
                size: this.coerce_bigint(data["size"]),
                price: Number(data["price"]),
                nonce,
            };
        } catch {
            return null;
        }
    }

    /**
     * Accepts the three shapes Anchor has been seen to use for a 32-byte
     * nonce: `Buffer`, `Uint8Array`, or `number[]`. Anything else returns
     * null so the caller can drop the event.
     */
    private coerce_nonce(input: unknown): Buffer | null {
        if (Buffer.isBuffer(input)) return input;
        if (input instanceof Uint8Array) return Buffer.from(input);
        if (Array.isArray(input)) return Buffer.from(input as number[]);
        return null;
    }

    /**
     * Accepts Anchor's u64-ish field representations: native `bigint`,
     * plain `number` (only valid for values < 2^53), `string` (the safe
     * BN.toString form), or any `{ toString(): string }` such as a `BN`.
     * Defaults to `0n` when input is unrecognized; the caller treats a
     * zero size as malformed.
     */
    private coerce_bigint(input: unknown): bigint {
        if (typeof input === "bigint") return input;
        if (typeof input === "number") return BigInt(input);
        if (typeof input === "string") return BigInt(input);
        if (input && typeof input === "object" && "toString" in input) {
            return BigInt((input as { toString(): string }).toString());
        }
        return 0n;
    }
}
