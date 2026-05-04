import { BorshCoder, EventParser } from "@coral-xyz/anchor";
import { IDL, type Contract } from "@solmarket/contract";
import { PublicKey } from "@solana/web3.js";
import SolanaConnectionFactory from "./connection";

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

export default class OrderFilledDecoder {
  private readonly parser: EventParser;

  constructor() {
    const program_id = SolanaConnectionFactory.get_program_id();
    const coder = new BorshCoder(IDL as unknown as Contract);
    this.parser = new EventParser(program_id, coder);
  }

  public decode_logs(logs: string[]): OrderFilledEvent[] {
    const out: OrderFilledEvent[] = [];
    for (const ev of this.parser.parseLogs(logs)) {
      if (ev.name !== "OrderFilled" && ev.name !== "orderFilled") continue;
      const decoded = this.normalize(ev.data);
      if (decoded) out.push(decoded);
    }
    return out;
  }

  private normalize(data: Record<string, unknown>): OrderFilledEvent | null {
    try {
      const nonce = this.coerce_nonce(data["nonce"]);
      if (!nonce) return null;
      return {
        user: new PublicKey(data["user"] as PublicKey | string),
        market: new PublicKey(data["market"] as PublicKey | string),
        polymarketMarketId: String(data["polymarketMarketId"] ?? data["polymarket_market_id"]),
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

  private coerce_nonce(input: unknown): Buffer | null {
    if (Buffer.isBuffer(input)) return input;
    if (input instanceof Uint8Array) return Buffer.from(input);
    if (Array.isArray(input)) return Buffer.from(input as number[]);
    return null;
  }

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
