import { prisma } from "@solmarket/database";

export interface CustodialUser {
    id: string;
    custodialPublicKey: string;
}

export default class UserRepo {
    public async find_by_custodial_pubkey(pubkey: string): Promise<CustodialUser | null> {
        const row = await prisma.user.findUnique({
            where: { custodialPublicKey: pubkey },
            select: { id: true, custodialPublicKey: true },
        });
        if (!row?.custodialPublicKey) return null;
        return { id: row.id, custodialPublicKey: row.custodialPublicKey };
    }
}
