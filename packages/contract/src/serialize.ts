import { PublicKey } from "@solana/web3.js";

import { SIGNED_QUOTE_BYTES } from "./constants";
import type { OrderSide, Outcome, QuoteInput } from "./types";

/**
 * Manual borsh writers used by the SDK to encode instruction args
 * without pulling in `@coral-xyz/anchor` or a generic borsh runtime.
 *
 * The encoders here only need to cover the field shapes the on-chain
 * handlers actually accept (fixed-size primitives, fixed-length byte
 * arrays, borsh strings, simple structs). Anything more elaborate is
 * intentionally out of scope — we hand-write each instruction's
 * encoder against the matching Rust struct.
 */
export class BorshWriter {
    private chunks: Buffer[] = [];

    public bytes(): Buffer {
        return Buffer.concat(this.chunks);
    }

    public push_u8(value: number): this {
        const buf = Buffer.alloc(1);
        buf.writeUInt8(value, 0);
        this.chunks.push(buf);
        return this;
    }

    public push_u16_le(value: number): this {
        const buf = Buffer.alloc(2);
        buf.writeUInt16LE(value, 0);
        this.chunks.push(buf);
        return this;
    }

    public push_u32_le(value: number): this {
        const buf = Buffer.alloc(4);
        buf.writeUInt32LE(value, 0);
        this.chunks.push(buf);
        return this;
    }

    public push_u64_le(value: bigint): this {
        const buf = Buffer.alloc(8);
        buf.writeBigUInt64LE(value, 0);
        this.chunks.push(buf);
        return this;
    }

    public push_i64_le(value: bigint): this {
        const buf = Buffer.alloc(8);
        buf.writeBigInt64LE(value, 0);
        this.chunks.push(buf);
        return this;
    }

    /** Writes raw bytes with no length prefix — used for fixed-size arrays like `[u8; 32]`. */
    public push_fixed(bytes: Buffer | Uint8Array): this {
        this.chunks.push(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes));
        return this;
    }

    public push_pubkey(pubkey: PublicKey): this {
        return this.push_fixed(pubkey.toBuffer());
    }

    /** Borsh string layout: 4-byte little-endian length + utf8 bytes. */
    public push_string(s: string): this {
        const utf8 = Buffer.from(s, "utf8");
        this.push_u32_le(utf8.length);
        this.chunks.push(utf8);
        return this;
    }
}

/**
 * Borsh-serialize a SignedQuote to match `state::SignedQuote` exactly.
 * The result is the message body that the off-chain quote signer signs
 * with its ed25519 keypair, and that the on-chain ed25519 verification
 * step checks against. A 1-byte drift here breaks every trade, so it's
 * one of the two layouts that absolutely must stay locked-step with Rust.
 */
export function serialize_signed_quote(q: QuoteInput): Buffer {
    const w = new BorshWriter()
        .push_pubkey(q.market)
        .push_u8(q.side)
        .push_u8(q.outcome)
        .push_u16_le(q.price)
        .push_u64_le(q.size)
        .push_i64_le(q.expiresAt)
        .push_fixed(q.nonce);
    const out = w.bytes();
    if (out.length !== SIGNED_QUOTE_BYTES) {
        throw new Error(
            `serialize_signed_quote produced ${out.length} bytes, expected ${SIGNED_QUOTE_BYTES}`,
        );
    }
    return out;
}

/** Encodes the `create_market` instruction args struct (see `instructions/create_market.rs`). */
export function encode_create_market_args(args: {
    polymarket_market_id_hash: Buffer;
    polymarket_market_id: string;
    question_hash: Buffer;
    end_time: bigint;
    tick_size: number;
    yes_token_id: string;
    no_token_id: string;
}): Buffer {
    if (args.polymarket_market_id_hash.length !== 32) {
        throw new Error("polymarket_market_id_hash must be 32 bytes");
    }
    if (args.question_hash.length !== 32) {
        throw new Error("question_hash must be 32 bytes");
    }
    return new BorshWriter()
        .push_fixed(args.polymarket_market_id_hash)
        .push_string(args.polymarket_market_id)
        .push_fixed(args.question_hash)
        .push_i64_le(args.end_time)
        .push_u16_le(args.tick_size)
        .push_string(args.yes_token_id)
        .push_string(args.no_token_id)
        .bytes();
}

/** Encodes the `initialize_config` instruction args (oracle + quote signer pubkeys). */
export function encode_initialize_config_args(oracle_signer: PublicKey, quote_signer: PublicKey): Buffer {
    return new BorshWriter().push_pubkey(oracle_signer).push_pubkey(quote_signer).bytes();
}

/**
 * The `place_order` instruction's payload is just a `SignedQuote` —
 * the Rust handler does `SignedQuote::try_from_slice(instruction_data)`
 * directly without a wrapping struct.
 */
export function encode_place_order_args(quote: QuoteInput): Buffer {
    return serialize_signed_quote(quote);
}

export function encode_resolve_market_args(winning_outcome: Outcome): Buffer {
    return new BorshWriter().push_u8(winning_outcome).bytes();
}

export function encode_close_used_nonce_args(nonce: Buffer): Buffer {
    if (nonce.length !== 16) throw new Error("nonce must be 16 bytes");
    return new BorshWriter().push_fixed(nonce).bytes();
}

/** No payload — exported for symmetry with the other encoders. */
export function encode_empty_args(): Buffer {
    return Buffer.alloc(0);
}

/** Re-exported casts for external callers that need the union types. */
export type { OrderSide, Outcome };
