import { createHash } from "node:crypto";

/**
 * Anchor-style discriminator helpers. The native-rust program at
 * `apps/solana/programs/contract` uses these exact preimages — see
 * `programs/contract/src/utils/discriminator.rs`. Keeping them in sync
 * is what lets a non-Anchor TS client talk to a non-Anchor Rust program
 * while remaining wire-compatible with anything else that speaks the
 * Anchor convention.
 */
function sha256_8(preimage: string): Buffer {
  return createHash("sha256").update(preimage).digest().subarray(0, 8);
}

/** Instruction discriminator: `sha256("global:<snake_name>")[0..8]`. */
export function ix_disc(snake_name: string): Buffer {
  return sha256_8(`global:${snake_name}`);
}

/** Account discriminator: `sha256("account:<PascalName>")[0..8]`. */
export function account_disc(pascal_name: string): Buffer {
  return sha256_8(`account:${pascal_name}`);
}

/** Event discriminator: `sha256("event:<PascalName>")[0..8]`. */
export function event_disc(pascal_name: string): Buffer {
  return sha256_8(`event:${pascal_name}`);
}
