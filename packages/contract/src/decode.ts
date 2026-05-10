import { PublicKey } from "@solana/web3.js";

import { ANCHOR_DISCRIMINATOR_LEN } from "./constants";
import { account_disc, event_disc } from "./discriminator";
import type {
    ClaimedEvent,
    ConfigAccount,
    MarketAccount,
    MarketResolvedEvent,
    MarketStatus,
    OrderFilledEvent,
    PositionClosedEvent,
    UsedNonceAccount,
    UserPositionAccount,
} from "./types";

/**
 * Manual borsh reader for the SDK. Tracks an internal cursor over a
 * Buffer and exposes typed `read_*` helpers. Used by the event decoder
 * and the account-state decoders below.
 *
 * No `bigint` clamps to safe ints — callers expecting <2^53 values can
 * narrow themselves. Out-of-range reads throw to surface drift between
 * Rust and TS layouts immediately.
 */
class BorshReader {
    private cursor = 0;
    constructor(private readonly buf: Buffer) {}

    private advance(n: number): number {
        const start = this.cursor;
        if (start + n > this.buf.length) {
            throw new Error(
                `borsh read past end: cursor=${start} need=${n} len=${this.buf.length}`,
            );
        }
        this.cursor += n;
        return start;
    }

    public read_u8(): number {
        const start = this.advance(1);
        return this.buf.readUInt8(start);
    }

    public read_u16_le(): number {
        const start = this.advance(2);
        return this.buf.readUInt16LE(start);
    }

    public read_u32_le(): number {
        const start = this.advance(4);
        return this.buf.readUInt32LE(start);
    }

    public read_u64_le(): bigint {
        const start = this.advance(8);
        return this.buf.readBigUInt64LE(start);
    }

    public read_i64_le(): bigint {
        const start = this.advance(8);
        return this.buf.readBigInt64LE(start);
    }

    public read_fixed(n: number): Buffer {
        const start = this.advance(n);
        return Buffer.from(this.buf.subarray(start, start + n));
    }

    public read_pubkey(): PublicKey {
        return new PublicKey(this.read_fixed(32));
    }

    public read_string(): string {
        const len = this.read_u32_le();
        const start = this.advance(len);
        return this.buf.subarray(start, start + len).toString("utf8");
    }

    public read_optional_u8(): number | null {
        const tag = this.read_u8();
        if (tag === 0) return null;
        if (tag === 1) return this.read_u8();
        throw new Error(`invalid Option<u8> tag ${tag}`);
    }

    public read_market_status(): MarketStatus {
        const tag = this.read_u8();
        if (tag === 0) return "Open";
        if (tag === 1) return "Resolved";
        if (tag === 2) return "Cancelled";
        throw new Error(`invalid MarketStatus tag ${tag}`);
    }
}

const ORDER_FILLED_DISC = event_disc("OrderFilled");
const MARKET_RESOLVED_DISC = event_disc("MarketResolved");
const CLAIMED_DISC = event_disc("Claimed");
const POSITION_CLOSED_DISC = event_disc("PositionClosed");

/**
 * Decodes `OrderFilled` events out of a transaction's `logMessages`
 * array. Replaces Anchor's `EventParser`, which we removed when we
 * dropped `@coral-xyz/anchor`.
 *
 * The decoder tracks program-invoke depth so events emitted by other
 * programs in the same transaction are ignored even on the unlikely
 * chance that their event data starts with our 8-byte discriminator.
 * The match is "any frame whose top-of-stack is `program_id`."
 *
 * Logs that don't parse cleanly are skipped silently — the listener
 * survives one malformed event while still consuming the rest of the
 * batch (same swallow-on-bad-log behavior as v1's hedger ingester).
 */
export class EventLogDecoder {
    private readonly programIdStr: string;

    constructor(program_id: PublicKey) {
        this.programIdStr = program_id.toBase58();
    }

    public decode_order_filled(logs: string[]): OrderFilledEvent[] {
        return this.decode_events(logs, ORDER_FILLED_DISC, (r) => parse_order_filled(r));
    }

    public decode_market_resolved(logs: string[]): MarketResolvedEvent[] {
        return this.decode_events(logs, MARKET_RESOLVED_DISC, (r) => parse_market_resolved(r));
    }

    public decode_claimed(logs: string[]): ClaimedEvent[] {
        return this.decode_events(logs, CLAIMED_DISC, (r) => parse_claimed(r));
    }

    public decode_position_closed(logs: string[]): PositionClosedEvent[] {
        return this.decode_events(logs, POSITION_CLOSED_DISC, (r) => parse_position_closed(r));
    }

    private decode_events<T>(
        logs: string[],
        disc: Buffer,
        parse: (r: BorshReader) => T,
    ): T[] {
        const out: T[] = [];
        const stack: string[] = [];
        for (const line of logs) {
            const invoke_id = match_invoke(line);
            if (invoke_id) {
                stack.push(invoke_id);
                continue;
            }
            if (match_terminator(line)) {
                stack.pop();
                continue;
            }
            const data_b64 = match_program_data(line);
            if (!data_b64) continue;
            if (stack[stack.length - 1] !== this.programIdStr) continue;
            const event = try_parse_event(data_b64, disc, parse);
            if (event !== null) out.push(event);
        }
        return out;
    }
}

function match_invoke(line: string): string | null {
    // "Program <id> invoke [<n>]"
    const m = /^Program (\S+) invoke \[\d+\]$/.exec(line);
    return m ? (m[1] ?? null) : null;
}

function match_terminator(line: string): boolean {
    // "Program <id> success" or "Program <id> failed: ..."
    return /^Program \S+ (success|failed)/.test(line);
}

function match_program_data(line: string): string | null {
    const prefix = "Program data: ";
    return line.startsWith(prefix) ? line.slice(prefix.length) : null;
}

function try_parse_event<T>(
    data_b64: string,
    disc: Buffer,
    parse: (r: BorshReader) => T,
): T | null {
    try {
        const raw = Buffer.from(data_b64, "base64");
        if (raw.length < 8) return null;
        if (!raw.subarray(0, 8).equals(disc)) return null;
        const reader = new BorshReader(raw.subarray(8));
        return parse(reader);
    } catch {
        return null;
    }
}

function parse_order_filled(r: BorshReader): OrderFilledEvent {
    const user = r.read_pubkey();
    const market = r.read_pubkey();
    const polymarketMarketId = r.read_string();
    const side = r.read_u8();
    const outcome = r.read_u8();
    const size = r.read_u64_le();
    const price = r.read_u16_le();
    const nonce = r.read_fixed(16);
    return { user, market, polymarketMarketId, side, outcome, size, price, nonce };
}

function parse_market_resolved(r: BorshReader): MarketResolvedEvent {
    return { market: r.read_pubkey(), winningOutcome: r.read_u8() };
}

function parse_claimed(r: BorshReader): ClaimedEvent {
    return {
        user: r.read_pubkey(),
        market: r.read_pubkey(),
        outcome: r.read_u8(),
        shares: r.read_u64_le(),
        payout: r.read_u64_le(),
    };
}

function parse_position_closed(r: BorshReader): PositionClosedEvent {
    return {
        user: r.read_pubkey(),
        market: r.read_pubkey(),
        rentRecipient: r.read_pubkey(),
    };
}

// ─────────────────────────── Account decoders ───────────────────────────

/**
 * Helpers to decode `[8-byte discriminator][borsh body]` account data
 * fetched via `connection.getAccountInfo`. Each guards the discriminator
 * to detect schema drift early.
 */
export function decode_config_account(data: Buffer): ConfigAccount {
    const r = open_account(data, "Config");
    return {
        admin: r.read_pubkey(),
        oracleSigner: r.read_pubkey(),
        quoteSigner: r.read_pubkey(),
        treasuryVault: r.read_pubkey(),
        usdcMint: r.read_pubkey(),
        treasuryAuthorityBump: r.read_u8(),
        treasuryVaultBump: r.read_u8(),
        bump: r.read_u8(),
    };
}

export function decode_market_account(data: Buffer): MarketAccount {
    const r = open_account(data, "Market");
    return {
        polymarketMarketId: r.read_string(),
        polymarketMarketIdHash: r.read_fixed(32),
        questionHash: r.read_fixed(32),
        endTime: r.read_i64_le(),
        tickSize: r.read_u16_le(),
        yesTokenId: r.read_string(),
        noTokenId: r.read_string(),
        status: r.read_market_status(),
        winningOutcome: r.read_optional_u8(),
        totalYes: r.read_u64_le(),
        totalNo: r.read_u64_le(),
        paused: r.read_u8() !== 0,
        bump: r.read_u8(),
    };
}

export function decode_user_position_account(data: Buffer): UserPositionAccount {
    const r = open_account(data, "UserPosition");
    return {
        user: r.read_pubkey(),
        market: r.read_pubkey(),
        yesShares: r.read_u64_le(),
        noShares: r.read_u64_le(),
        bump: r.read_u8(),
    };
}

export function decode_used_nonce_account(data: Buffer): UsedNonceAccount {
    const r = open_account(data, "UsedNonce");
    return { nonce: r.read_fixed(16), bump: r.read_u8() };
}

function open_account(data: Buffer, name: string): BorshReader {
    if (data.length < ANCHOR_DISCRIMINATOR_LEN) {
        throw new Error(`account too short for ${name} discriminator`);
    }
    const expected = account_disc(name);
    if (!data.subarray(0, ANCHOR_DISCRIMINATOR_LEN).equals(expected)) {
        throw new Error(`account discriminator mismatch — not a ${name}`);
    }
    return new BorshReader(data.subarray(ANCHOR_DISCRIMINATOR_LEN));
}
