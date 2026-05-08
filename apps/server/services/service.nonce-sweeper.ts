import { AnchorProvider } from "@coral-xyz/anchor";
import NodeWallet from "@coral-xyz/anchor/dist/esm/nodewallet.js";
import { Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { prisma } from "@solmarket/database";
import { SolmarketClient } from "@solmarket/contract";
import { ENV } from "../config/config.env";

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const EXPIRY_BUFFER_MS = 60 * 60 * 1000;
const BATCH_SIZE = 50;

/**
 * Periodically reclaims rent from `UsedNonce` PDAs whose corresponding
 * quote has long expired. Each PDA holds ~0.00094 SOL — at scale this is
 * a meaningful chunk of the platform's gas budget that would otherwise
 * sit locked forever.
 *
 * Safety: a quote is only swept once `expiresAt + EXPIRY_BUFFER_MS` has
 * passed. Even if an attacker had the original signed quote and tried
 * to replay it after the nonce PDA was closed, the on-chain place_order
 * `quote.expires_at > clock.unix_timestamp` check would still reject.
 *
 * Trust model: admin-signed close, no on-chain expiry verification.
 * Saves the 8-byte schema overhead per nonce that a self-verifying
 * close would need. The admin signer is the same keypair that already
 * resolves markets and pauses; not a meaningful expansion of trust.
 */
export default class NonceSweeperService {
    private timer: ReturnType<typeof setTimeout> | null = null;
    private running = false;

    public start(): void {
        if (!ENV.SERVER_SOLANA_ADMIN_KEYPAIR) {
            console.warn("[nonce-sweeper] SERVER_SOLANA_ADMIN_KEYPAIR not set — skipping");
            return;
        }
        this.schedule_next();
    }

    public stop(): void {
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
    }

    private schedule_next(): void {
        this.timer = setTimeout(() => void this.tick(), SWEEP_INTERVAL_MS);
    }

    private async tick(): Promise<void> {
        if (this.running) {
            this.schedule_next();
            return;
        }
        this.running = true;
        try {
            const swept = await this.sweep_once();
            if (swept > 0) console.log(`[nonce-sweeper] closed ${swept} nonce PDAs`);
        } catch (err) {
            console.error("[nonce-sweeper] tick failed", err);
        } finally {
            this.running = false;
            this.schedule_next();
        }
    }

    private async sweep_once(): Promise<number> {
        const cutoff = new Date(Date.now() - EXPIRY_BUFFER_MS);
        const due = await prisma.quote.findMany({
            where: {
                consumed: true,
                nonceClosedAt: null,
                expiresAt: { lt: cutoff },
            },
            select: { nonce: true },
            take: BATCH_SIZE,
            orderBy: { expiresAt: "asc" },
        });
        if (due.length === 0) return 0;

        const admin = NonceSweeperService.load_admin();
        const client = NonceSweeperService.build_client(admin);

        let closed = 0;
        for (const { nonce } of due) {
            try {
                await client.closeUsedNonce({
                    nonce: Buffer.from(nonce, "hex"),
                    admin,
                });
                await prisma.quote.update({
                    where: { nonce },
                    data: { nonceClosedAt: new Date() },
                });
                closed += 1;
            } catch (err) {
                // Common case: account already closed externally — mark it
                // done and stop retrying. Other errors: leave the row alone
                // so the next tick picks it up.
                const msg = err instanceof Error ? err.message : String(err);
                if (msg.includes("AccountNotInitialized") || msg.includes("not initialized")) {
                    await prisma.quote.update({
                        where: { nonce },
                        data: { nonceClosedAt: new Date() },
                    });
                } else {
                    console.warn(`[nonce-sweeper] failed to close ${nonce}`, msg);
                }
            }
        }
        return closed;
    }

    private static load_admin(): Keypair {
        const encoded = ENV.SERVER_SOLANA_ADMIN_KEYPAIR!;
        const trimmed = encoded.trim();
        if (trimmed.startsWith("[")) {
            const arr = JSON.parse(trimmed) as number[];
            return Keypair.fromSecretKey(Uint8Array.from(arr));
        }
        return Keypair.fromSecretKey(bs58.decode(trimmed));
    }

    private static build_client(admin: Keypair): SolmarketClient {
        const connection = new Connection(ENV.SERVER_SOLANA_RPC_URL, "confirmed");
        const provider = new AnchorProvider(connection, new NodeWallet(admin), {
            commitment: "confirmed",
            preflightCommitment: "confirmed",
        });
        return new SolmarketClient(provider);
    }
}
