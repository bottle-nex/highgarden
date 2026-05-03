import { AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import { Connection, Ed25519Program, Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { prisma } from "@solmarket/database";
import { SolmarketClient } from "@solmarket/contract";
import { ENV } from "../config/config.env";
import { decrypt_secret_key } from "./service.crypto";

export interface PlaceOrderInput {
    userId: string;
    marketDbId: string;
    signedQuote: SignedQuoteWire;
}

export interface SignedQuoteWire {
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

export interface PlaceOrderResult {
    txSignature: string;
    marketPda: string;
    userPubkey: string;
}

export default class SolanaTradeService {
    public async place_order(input: PlaceOrderInput): Promise<PlaceOrderResult> {
        const user_keypair = await this.load_custodial_keypair(input.userId);
        const market_pda = await this.load_market_pda(input.marketDbId);
        this.assert_quote_market(input.signedQuote, market_pda);

        const client = this.build_client(user_keypair);
        const ed25519_ix = this.build_ed25519_ix(input.signedQuote);
        const user_usdc = this.derive_user_usdc(user_keypair.publicKey);

        const sig = await this.send_place_order(client, {
            user: user_keypair,
            user_usdc,
            quote: input.signedQuote,
            ed25519_ix,
        });

        return {
            txSignature: sig,
            marketPda: market_pda.toBase58(),
            userPubkey: user_keypair.publicKey.toBase58(),
        };
    }

    private async load_custodial_keypair(user_id: string): Promise<Keypair> {
        const row = await prisma.user.findUnique({
            where: { id: user_id },
            select: { custodialPublicKey: true, custodialSecretEncrypted: true },
        });
        if (!row?.custodialSecretEncrypted || !row.custodialPublicKey) {
            throw new Error(`user ${user_id} has no custodial keypair`);
        }
        const seed = decrypt_secret_key(row.custodialSecretEncrypted);
        const keypair = Keypair.fromSeed(seed);
        if (keypair.publicKey.toBase58() !== row.custodialPublicKey) {
            throw new Error(
                "custodial keypair mismatch — derived pubkey does not match stored pubkey",
            );
        }
        return keypair;
    }

    private async load_market_pda(market_db_id: string): Promise<PublicKey> {
        const row = await prisma.market.findUnique({
            where: { id: market_db_id },
            select: { solanaMarketPda: true },
        });
        if (!row?.solanaMarketPda) {
            throw new Error(
                `market ${market_db_id} has no solanaMarketPda — approve via "Approve + List on Solana" first`,
            );
        }
        return new PublicKey(row.solanaMarketPda);
    }

    private assert_quote_market(quote: SignedQuoteWire, market_pda: PublicKey): void {
        if (quote.market !== market_pda.toBase58()) {
            throw new Error(
                `signed quote market ${quote.market} does not match market PDA ${market_pda.toBase58()}`,
            );
        }
    }

    private build_client(user_keypair: Keypair): SolmarketClient {
        const connection = new Connection(ENV.SERVER_SOLANA_RPC_URL, "confirmed");
        const provider = new AnchorProvider(connection, new Wallet(user_keypair), {
            commitment: "confirmed",
            preflightCommitment: "confirmed",
        });
        return new SolmarketClient(provider);
    }

    private build_ed25519_ix(quote: SignedQuoteWire) {
        const message = SolmarketClient.serializeSignedQuote({
            market: new PublicKey(quote.market),
            side: quote.side as 0 | 1,
            outcome: quote.outcome as 0 | 1,
            price: quote.price,
            size: new BN(quote.size),
            expiresAt: new BN(quote.expiresAt),
            nonce: Buffer.from(quote.nonceHex, "hex"),
        });

        return Ed25519Program.createInstructionWithPublicKey({
            publicKey: new PublicKey(quote.signerPubkey).toBytes(),
            message,
            signature: Buffer.from(quote.signatureBase64, "base64"),
        });
    }

    private derive_user_usdc(user_pubkey: PublicKey): PublicKey {
        const mint = new PublicKey(ENV.SERVER_USDC_MINT);
        return getAssociatedTokenAddressSync(mint, user_pubkey);
    }

    private async send_place_order(
        client: SolmarketClient,
        args: {
            user: Keypair;
            user_usdc: PublicKey;
            quote: SignedQuoteWire;
            ed25519_ix: Awaited<ReturnType<SolanaTradeService["build_ed25519_ix"]>>;
        },
    ): Promise<string> {
        return client.placeOrder({
            user: args.user.publicKey,
            quote: {
                market: new PublicKey(args.quote.market),
                side: args.quote.side as 0 | 1,
                outcome: args.quote.outcome as 0 | 1,
                price: args.quote.price,
                size: new BN(args.quote.size),
                expiresAt: new BN(args.quote.expiresAt),
                nonce: Buffer.from(args.quote.nonceHex, "hex"),
            },
            userUsdc: args.user_usdc,
            ed25519Ix: args.ed25519_ix,
        });
    }
}
