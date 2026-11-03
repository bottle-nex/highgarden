import { PublicKey } from "@solana/web3.js";
import {
    requestWithdrawalApproval,
    consumeWithdrawalApproval,
} from "../../services/service.withdrawal-approval";
import { notifyWithdrawal } from "../../services/service.withdrawal-notifications";
import { Router } from "express";
import { prisma } from "@solmarket/database";
import { requireAuth } from "../../middleware/middleware.auth";
import { rate_limiters as rl } from "../../middleware/middleware.rate-limit";
import ResponseWriter from "../../services/service.response";
import { ensure_user_has_keypair } from "../../services/service.keypair";
import { get_user_usdc_balance } from "../../services/service.wallet";
import PortfolioService from "../../services/service.portfolio";
import SolanaWithdrawService, { WithdrawError } from "../../services/service.solana-withdraw";
import { services } from "../../index";
import { ENV } from "../../config/config.env";

const user_router: Router = Router();
const portfolio = new PortfolioService();
const withdraw_service = new SolanaWithdrawService();

/**
 * Picks a display label for the configured RPC so the frontend wallet
 * dialog shows the actual cluster instead of a hardcoded string. Pure
 * substring match — fine because Solana cluster RPCs all carry the
 * cluster name in the URL. The contract is deployed on devnet and the
 * sweeper only handles devnet SOL, so mainnet is intentionally NOT a
 * supported label — a mainnet RPC falls through to "custom".
 */
function derive_network_label(rpc_url: string): string {
    const u = rpc_url.toLowerCase();
    if (u.includes("devnet")) return "devnet";
    if (u.includes("testnet")) return "testnet";
    if (u.includes("localhost") || u.includes("127.0.0.1")) return "localnet";
    return "custom";
}

user_router.get("/me", rl.read, requireAuth, async (req, res) => {
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

user_router.get("/me/wallet", rl.read, requireAuth, async (req, res) => {
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

user_router.get("/me/positions", rl.read, requireAuth, async (req, res) => {
    try {
        const positions = await portfolio.list_positions(req.user!.id);
        return ResponseWriter.success(res, positions, "OK");
    } catch (err) {
        console.error("[users/me/positions]", err);
        return ResponseWriter.system_error(res);
    }
});

user_router.get("/me/fills", rl.read, requireAuth, async (req, res) => {
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
user_router.get("/me/deposits", rl.read, requireAuth, async (req, res) => {
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
 * Withdraw USDC from the user's custodial wallet to any Solana address.
 * Admin keypair pays the SOL tx fee and, if needed, the rent to create
 * the recipient's USDC ATA — the user only sees USDC debit from their
 * custodial balance.
 */
user_router.post("/me/withdraw/request", requireAuth, rl.withdraw, async (req, res) => {
    const { destination, uiAmount } = req.body ?? {};
    if (typeof destination !== "string" || !Number.isFinite(uiAmount) || uiAmount < 1) {
        return ResponseWriter.invalid_data(res, "Valid destination and amount required");
    }
    try {
        const address = new PublicKey(destination.trim()).toBase58();
        const user = await prisma.user.findUnique({
            where: { id: req.user!.id },
            select: { email: true },
        });
        if (!user) return ResponseWriter.not_authorized(res);
        const sent = await requestWithdrawalApproval(
            { userId: req.user!.id, destination: address, uiAmount },
            user.email,
        );
        if (!sent)
            return ResponseWriter.custom(
                res,
                false,
                "OTP_COOLDOWN",
                "Wait before requesting another code",
                429,
            );
        return ResponseWriter.success(res, { ok: true }, "Withdrawal confirmation sent");
    } catch (err) {
        console.error("[withdrawal-approval]", err);
        return ResponseWriter.invalid_data(
            res,
            "Unable to send withdrawal confirmation; check the address and try again",
        );
    }
});

user_router.post("/me/withdraw", requireAuth, rl.withdraw, async (req, res) => {
    const body = (req.body ?? {}) as { destination?: unknown; uiAmount?: unknown; code?: unknown };
    const destination = typeof body.destination === "string" ? body.destination.trim() : "";
    const ui_amount = typeof body.uiAmount === "number" ? body.uiAmount : NaN;

    if (!destination) return ResponseWriter.invalid_data(res, "destination address required");
    if (!Number.isFinite(ui_amount))
        return ResponseWriter.invalid_data(res, "uiAmount must be a number");

    try {
        const approved =
            typeof body.code === "string" &&
            (await consumeWithdrawalApproval(
                { userId: req.user!.id, destination, uiAmount: ui_amount },
                body.code,
            ));
        if (!approved)
            return ResponseWriter.invalid_data(res, "Valid withdrawal confirmation code required");
        const user = await prisma.user.findUnique({
            where: { id: req.user!.id },
            select: { email: true },
        });
        if (!user) return ResponseWriter.not_authorized(res);
        const result = await withdraw_service.withdraw_usdc({
            userId: req.user!.id,
            destination,
            uiAmount: ui_amount,
        });
        // A delivery failure must not turn a completed transfer into a retriable withdrawal.
        try {
            await notifyWithdrawal(services.redis, user.email, result);
        } catch (error) {
            console.error("[withdrawal-email] could not persist receipt", {
                signature: result.txSignature,
                error,
            });
        }
        return ResponseWriter.success(res, result, "Withdrawn");
    } catch (err) {
        if (err instanceof WithdrawError) {
            return ResponseWriter.error(res, err.code, err.message, undefined, 409);
        }
        console.error("[users/me/withdraw]", err);
        const msg = err instanceof Error ? err.message : "withdraw failed";
        return ResponseWriter.error(res, "WITHDRAW_FAILED", msg, undefined, 500);
    }
});

/**
 * Manual trigger for the SolDepositPoller — used by the "I just sent
 * SOL" button so the user doesn't have to wait for the next poll tick.
 * Idempotent: if a deposit is already in flight for this user, the
 * poller's in-flight check makes this a no-op.
 */
user_router.post("/me/check-deposits", rl.mutate, requireAuth, async (req, res) => {
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
