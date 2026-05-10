import { Connection, Ed25519Program, Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import bs58 from "bs58";
import { prisma } from "@solmarket/database";
import { SolmarketClient } from "@solmarket/contract";
import { ENV } from "../config/config.env";
import { decrypt_secret_key } from "./service.crypto";
import chalk from "chalk";

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
        console.log(chalk.red("input came is : "), input);
        const user_keypair: Keypair = await this.load_custodial_keypair(input.userId);
        const market_pda = await this.load_market_pda(input.marketDbId);
        this.assert_quote_market(input.signedQuote, market_pda);

        const fee_payer = this.load_fee_payer_keypair();
        const client = this.build_client(fee_payer);
        const ed25519_ix = this.build_ed25519_ix(input.signedQuote);
        const user_usdc = this.derive_user_usdc(user_keypair.publicKey);
        console.log(chalk.yellow("user usdc is : "), user_usdc);
        const sig = await this.send_place_order(client, {
            user: user_keypair,
            fee_payer,
            user_usdc,
            quote: input.signedQuote,
            ed25519_ix,
        });

        // Write the Fill row now so the user's portfolio reflects the trade
        // immediately, independent of hedger liveness. The hedger uses the
        // same nonce for idempotency, so its later write is a no-op.
        await this.record_fill_idempotent({
            userId: input.userId,
            marketDbId: input.marketDbId,
            quote: input.signedQuote,
            txSignature: sig,
        });

        console.log(chalk.green("final payload is : "), {
            txSignature: sig,
            marketPda: market_pda.toBase58(),
            userPubkey: user_keypair.publicKey.toBase58(),
        });

        return {
            txSignature: sig,
            marketPda: market_pda.toBase58(),
            userPubkey: user_keypair.publicKey.toBase58(),
        };
    }

    private async record_fill_idempotent(args: {
        userId: string;
        marketDbId: string;
        quote: SignedQuoteWire;
        txSignature: string;
    }): Promise<void> {
        const side = args.quote.side === 0 ? "BUY" : "SELL";
        const outcome = args.quote.outcome === 0 ? "YES" : "NO";
        try {
            await prisma.fill.create({
                data: {
                    userId: args.userId,
                    marketId: args.marketDbId,
                    side,
                    outcome,
                    price: args.quote.price,
                    size: args.quote.size,
                    solanaTxSig: args.txSignature,
                    nonce: args.quote.nonceHex,
                },
            });
        } catch (err) {
            // P2002 = unique violation on nonce or txSig — hedger already
            // wrote it, our row is redundant. Anything else, log and swallow:
            // the on-chain trade succeeded, we don't want to fail the whole
            // request just because we couldn't record it server-side.
            const code = (err as { code?: string }).code;
            if (code !== "P2002") {
                console.error("[solana-trade/record_fill]", err);
            }
        }
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

    /**
     * Loads the platform's fee-payer keypair. Reuses SERVER_SOLANA_ADMIN_KEYPAIR
     * since admin already has SOL provisioned. The custodial wallet stays at
     * zero SOL — admin pays tx fees and rent for any new PDAs.
     */
    private load_fee_payer_keypair(): Keypair {
        const encoded = ENV.SERVER_SOLANA_ADMIN_KEYPAIR;
        if (!encoded) {
            throw new Error(
                "SERVER_SOLANA_ADMIN_KEYPAIR not set — fee_payer is required for placeOrder/claim",
            );
        }
        const trimmed = encoded.trim();
        if (trimmed.startsWith("[")) {
            const arr = JSON.parse(trimmed) as number[];
            return Keypair.fromSecretKey(Uint8Array.from(arr));
        }
        return Keypair.fromSecretKey(bs58.decode(trimmed));
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

    private build_client(_user_keypair: Keypair): SolmarketClient {
        const connection = new Connection(ENV.SERVER_SOLANA_RPC_URL, "confirmed");
        return new SolmarketClient({
            connection,
            programId: new PublicKey(ENV.SERVER_SOLANA_PROGRAM_ID),
        });
    }

    private build_ed25519_ix(quote: SignedQuoteWire) {
        const message = SolmarketClient.serializeSignedQuote({
            market: new PublicKey(quote.market),
            side: quote.side as 0 | 1,
            outcome: quote.outcome as 0 | 1,
            price: quote.price,
            size: BigInt(quote.size),
            expiresAt: BigInt(quote.expiresAt),
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
            fee_payer: Keypair;
            user_usdc: PublicKey;
            quote: SignedQuoteWire;
            ed25519_ix: Awaited<ReturnType<SolanaTradeService["build_ed25519_ix"]>>;
        },
    ): Promise<string> {
        return client.placeOrder({
            user: args.user.publicKey,
            userKeypair: args.user,
            feePayer: args.fee_payer,
            quote: {
                market: new PublicKey(args.quote.market),
                side: args.quote.side as 0 | 1,
                outcome: args.quote.outcome as 0 | 1,
                price: args.quote.price,
                size: BigInt(args.quote.size),
                expiresAt: BigInt(args.quote.expiresAt),
                nonce: Buffer.from(args.quote.nonceHex, "hex"),
            },
            userUsdc: args.user_usdc,
            ed25519Ix: args.ed25519_ix,
        });
    }
}
