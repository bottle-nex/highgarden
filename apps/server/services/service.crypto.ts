import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ENV } from "../config/config.env";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const VERSION = "v1";

function get_master_key(): Buffer {
    const key = Buffer.from(ENV.SERVER_KEY_ENCRYPTION_KEY, "base64");
    if (key.length !== 32) {
        throw new Error("SERVER_KEY_ENCRYPTION_KEY must decode to 32 bytes");
    }
    return key;
}

export function encrypt_secret_key(plaintext: Uint8Array): string {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGO, get_master_key(), iv);
    const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(
        ":",
    );
}

export function decrypt_secret_key(serialized: string): Uint8Array {
    const parts = serialized.split(":");
    if (parts.length !== 4) {
        throw new Error("malformed ciphertext");
    }
    const [version, iv_b64, tag_b64, ct_b64] = parts as [string, string, string, string];
    if (version !== VERSION) {
        throw new Error(`unsupported ciphertext version: ${version}`);
    }
    const iv = Buffer.from(iv_b64, "base64");
    const tag = Buffer.from(tag_b64, "base64");
    const ct = Buffer.from(ct_b64, "base64");
    const decipher = createDecipheriv(ALGO, get_master_key(), iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return new Uint8Array(pt);
}
