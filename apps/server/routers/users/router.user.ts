import { Router } from "express";
import { prisma } from "@solmarket/database";
import { requireAuth } from "../../middleware/middleware.auth";
import ResponseWriter from "../../services/service.response";
import { ensure_user_has_keypair } from "../../services/service.keypair";
import { get_user_usdc_balance } from "../../services/service.wallet";
import { ENV } from "../../config/config.env";

const user_router: Router = Router();

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
                network: "mainnet-beta",
            },
            "OK",
        );
    } catch (err) {
        console.error("[users/me/wallet]", err);
        return ResponseWriter.system_error(res);
    }
});

export default user_router;
