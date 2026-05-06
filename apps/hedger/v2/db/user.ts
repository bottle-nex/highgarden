import { prisma } from "@solmarket/database";

/**
 * Minimal projection of the `User` row that the hedger actually needs.
 * Picking just `id` + `custodialPublicKey` keeps the Prisma `select`
 * narrow and means a future column rename elsewhere on `User` doesn't
 * cascade through hedger code.
 */
export interface CustodialUser {
    id: string;
    custodialPublicKey: string;
}

export default class User {
    /**
     * Looks up a user by their custodial Solana pubkey. Returns null if no
     * row matches — the caller (HedgeProcessor) treats that as a
     * `RetryableError` because it usually means the User row hasn't been
     * replicated to this read replica yet.
     */
    static async find_by_custodial_pubkey(pubkey: string): Promise<CustodialUser | null> {
        const row = await prisma.user.findUnique({
            where: { custodialPublicKey: pubkey },
            select: { id: true, custodialPublicKey: true },
        });
        if (!row?.custodialPublicKey) return null;
        return { id: row.id, custodialPublicKey: row.custodialPublicKey };
    }
}
