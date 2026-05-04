import { prisma } from "@solmarket/database";
import type { Side, Outcome } from "@solmarket/database";

export interface InsertFillParams {
  nonceHex: string;
  txSignature: string;
  userId: string;
  marketId: string;
  side: Side;
  outcome: Outcome;
  priceCents: number;
  sizeShares: number;
}

export interface FillRow {
  id: string;
  nonce: string;
  userId: string;
  marketId: string;
  side: Side;
  outcome: Outcome;
  price: number;
  size: number;
  solanaTxSig: string;
}

export default class FillRepo {
  public async find_by_nonce(nonce_hex: string): Promise<FillRow | null> {
    const row = await prisma.fill.findUnique({ where: { nonce: nonce_hex } });
    return this.shape(row);
  }

  public async insert_idempotent(
    params: InsertFillParams,
  ): Promise<{ row: FillRow; created: boolean }> {
    const existing = await this.find_by_nonce(params.nonceHex);
    if (existing) return { row: existing, created: false };

    try {
      const created = await prisma.fill.create({
        data: {
          userId: params.userId,
          marketId: params.marketId,
          side: params.side,
          outcome: params.outcome,
          price: params.priceCents,
          size: params.sizeShares,
          solanaTxSig: params.txSignature,
          nonce: params.nonceHex,
        },
      });
      return { row: this.shape(created)!, created: true };
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") {
        const row = await this.find_by_nonce(params.nonceHex);
        if (row) return { row, created: false };
      }
      throw err;
    }
  }

  private shape(
    row: {
      id: string;
      userId: string;
      marketId: string;
      side: Side;
      outcome: Outcome;
      price: number;
      size: number;
      solanaTxSig: string;
      nonce: string | null;
    } | null,
  ): FillRow | null {
    if (!row || !row.nonce) return null;
    return {
      id: row.id,
      nonce: row.nonce,
      userId: row.userId,
      marketId: row.marketId,
      side: row.side,
      outcome: row.outcome,
      price: row.price,
      size: row.size,
      solanaTxSig: row.solanaTxSig,
    };
  }
}
