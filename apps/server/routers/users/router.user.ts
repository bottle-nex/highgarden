import { Router } from "express";
import { prisma } from "@solmarket/database";
import { requireAuth } from "../../middleware/middleware.auth";
import ResponseWriter from "../../services/service.response";
import { ensure_user_has_keypair } from "../../services/service.keypair";
import { get_user_usdc_balance } from "../../services/service.wallet";
import PortfolioService from "../../services/service.portfolio";
import { services } from "../../index";
import { ENV } from "../../config/config.env";

const user_router: Router = Router();
const portfolio = new PortfolioService();

/**
 * Picks a display label for the configured RPC so the frontend wallet
 * dialog shows the actual cluster instead of a hardcoded string. Pure
 * substring match — fine because Solana cluster RPCs all carry the
 * cluster name in the URL (`devnet.helius`, `api.mainnet-beta`, etc).
 */
function derive_network_label(rpc_url: string): string {
    const u = rpc_url.toLowerCase();
    if (u.includes("devnet")) return "devnet";
    if (u.includes("testnet")) return "testnet";
    if (u.includes("mainnet")) return "mainnet-beta";
    if (u.includes("localhost") || u.includes("127.0.0.1")) return "localnet";
    return "custom";
}

user_router.get("/me", requireAuth, async (req, res) => {
    try {
        const u = await prisma.user.findUnique({
            where: { id: req.user!.id },
            select: {
                id: true,
                email: true,
                name: true,
                image: true,
                custodialPublicKey: true,
            },
        });
        if (!u) return ResponseWriter.not_found(res, "User not found");
        return ResponseWriter.success(
            res,
            {
                id: u.id,
                email: u.email,
                name: u.name,
                image: u.image,
                walletPublicKey: u.custodialPublicKey,
            },
            "OK",
        );
    } catch (err) {
        console.error("[users/me]", err);
        return ResponseWriter.system_error(res);
    }
});

user_router.get("/me/wallet", requireAuth, async (req, res) => {
    try {
        const publicKey = await ensure_user_has_keypair(req.user!.id);
        const usdcBalance = await get_user_usdc_balance(publicKey);
        return ResponseWriter.success(
            res,
            {
                publicKey,
                usdcBalance,
                usdcMint: ENV.SERVER_USDC_MINT,
                network: derive_network_label(ENV.SERVER_SOLANA_RPC_URL),
            },
            "OK",
        );
    } catch (err) {
        console.error("[users/me/wallet]", err);
        return ResponseWriter.system_error(res);
    }
});

user_router.get("/me/positions", requireAuth, async (req, res) => {
    try {
        const positions = await portfolio.list_positions(req.user!.id);
        return ResponseWriter.success(res, positions, "OK");
    } catch (err) {
        console.error("[users/me/positions]", err);
        return ResponseWriter.system_error(res);
    }
});

user_router.get("/me/fills", requireAuth, async (req, res) => {
    try {
        const fills = await portfolio.list_fills(req.user!.id);
        return ResponseWriter.success(res, fills, "OK");
    } catch (err) {
        console.error("[users/me/fills]", err);
        return ResponseWriter.system_error(res);
    }
});

/**
 * Lists the user's SOL → USDC deposits, newest first. Used by the
 * frontend deposit dialog to show "Last 10 conversions" and surface
 * any FAILED rows that need ops attention.
 */
user_router.get("/me/deposits", requireAuth, async (req, res) => {
    try {
        const rows = await prisma.solDeposit.findMany({
            where: { userId: req.user!.id },
            orderBy: { createdAt: "desc" },
            take: 20,
            select: {
                id: true,
                solLamports: true,
                solUsdRateCents: true,
                usdcMintedRaw: true,
                sweepTxSig: true,
                mintTxSig: true,
                status: true,
                error: true,
                createdAt: true,
                completedAt: true,
            },
        });
        const shaped = rows.map((r) => ({
            id: r.id,
            // Numbers for the wire — solLamports / usdcMintedRaw are well
            // within Number.MAX_SAFE_INTEGER for any realistic deposit.
            solLamports: Number(r.solLamports),
            solUsdRateCents: r.solUsdRateCents,
            usdcMintedRaw: Number(r.usdcMintedRaw),
            sweepTxSig: r.sweepTxSig,
            mintTxSig: r.mintTxSig,
            status: r.status,
            error: r.error,
            createdAt: r.createdAt.toISOString(),
            completedAt: r.completedAt?.toISOString() ?? null,
        }));
        return ResponseWriter.success(res, shaped, "OK");
    } catch (err) {
        console.error("[users/me/deposits]", err);
        return ResponseWriter.system_error(res);
    }
});

/**
 * Manual trigger for the SolDepositPoller — used by the "I just sent
 * SOL" button so the user doesn't have to wait for the next poll tick.
 * Idempotent: if a deposit is already in flight for this user, the
 * poller's in-flight check makes this a no-op.
 */
user_router.post("/me/check-deposits", requireAuth, async (req, res) => {
    try {
        const result = await services.sol_deposit_poller.check_now(req.user!.id);
        return ResponseWriter.success(
            res,
            result,
            result.detected ? "Deposit detected — converting" : "No new deposit found",
        );
    } catch (err) {
        console.error("[users/me/check-deposits]", err);
        return ResponseWriter.system_error(res);
    }
});

export default user_router;
