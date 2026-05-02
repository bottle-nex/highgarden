import { randomBytes } from "node:crypto";
import { createKeyPairFromPrivateKeyBytes, getAddressFromPublicKey } from "@solana/kit";
import { prisma } from "@solmarket/database";
import { encrypt_secret_key } from "./service.crypto";

export interface KeypairRecord {
    publicKey: string;
    encryptedSecret: string;
}

export async function generate_user_keypair(): Promise<KeypairRecord> {
    const seed = randomBytes(32);
    const kp = await createKeyPairFromPrivateKeyBytes(seed);
    const publicKey = await getAddressFromPublicKey(kp.publicKey);
    const encryptedSecret = encrypt_secret_key(new Uint8Array(seed));
    return { publicKey, encryptedSecret };
}

export async function get_user_public_key(user_id: string): Promise<string | null> {
    const u = await prisma.user.findUnique({
        where: { id: user_id },
        select: { custodialPublicKey: true },
    });
    return u?.custodialPublicKey ?? null;
}

export async function ensure_user_has_keypair(user_id: string): Promise<string> {
    const existing = await get_user_public_key(user_id);
    if (existing) return existing;

    const { publicKey, encryptedSecret } = await generate_user_keypair();
    try {
        await prisma.user.update({
            where: { id: user_id },
            data: {
                custodialPublicKey: publicKey,
                custodialSecretEncrypted: encryptedSecret,
            },
        });
        console.info("[keypair] created", { user_id, publicKey });
        return publicKey;
    } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === "P2002") {
            const after_race = await get_user_public_key(user_id);
            if (after_race) return after_race;
        }
        throw err;
    }
}
