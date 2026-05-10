import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { SolmarketClient } from "@solmarket/contract";
import { ENV } from "../config/config.env";

export interface QuoteFields {
    market: PublicKey;
    side: 0 | 1;
    outcome: 0 | 1;
    priceCents: number;
    sizeShares: number;
    expiresAt: number;
    nonce: Buffer;
}

export interface SerializedSignedQuote {
    market: string;
    side: number;
    outcome: number;
    price: number;
    size: number;
    expiresAt: number;
    nonceHex: string;
    signatureBase64: string;
    signerPubkey: string;
}

export default class QuoteSignerService {
    private signer: Keypair | null = null;

    public is_configured(): boolean {
        return !!ENV.SERVER_QUOTE_SIGNER_KEYPAIR;
    }

    public sign(fields: QuoteFields): SerializedSignedQuote {
        const signer = this.get_signer();
        const message = this.build_message(fields);
        const signature = nacl.sign.detached(message, signer.secretKey);
        return this.shape_response(fields, signature, signer.publicKey);
    }

    private build_message(fields: QuoteFields): Uint8Array {
        return SolmarketClient.serializeSignedQuote({
            market: fields.market,
            side: fields.side,
            outcome: fields.outcome,
            price: fields.priceCents,
            size: BigInt(fields.sizeShares),
            expiresAt: BigInt(fields.expiresAt),
            nonce: fields.nonce,
        });
    }

    private shape_response(
        fields: QuoteFields,
        signature: Uint8Array,
        signer_pubkey: PublicKey,
    ): SerializedSignedQuote {
        return {
            market: fields.market.toBase58(),
            side: fields.side,
            outcome: fields.outcome,
            price: fields.priceCents,
            size: fields.sizeShares,
            expiresAt: fields.expiresAt,
            nonceHex: fields.nonce.toString("hex"),
            signatureBase64: Buffer.from(signature).toString("base64"),
            signerPubkey: signer_pubkey.toBase58(),
        };
    }

    private get_signer(): Keypair {
        if (!this.signer) this.signer = this.load_signer();
        return this.signer;
    }

    private load_signer(): Keypair {
        const raw = ENV.SERVER_QUOTE_SIGNER_KEYPAIR;
        if (!raw) {
            throw new Error("SERVER_QUOTE_SIGNER_KEYPAIR is not set");
        }
        const trimmed = raw.trim();
        if (trimmed.startsWith("[")) {
            return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(trimmed) as number[]));
        }
        return Keypair.fromSecretKey(bs58.decode(trimmed));
    }
}
