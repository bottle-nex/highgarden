import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "@solmarket/database";
import ResponseWriter from "../../services/service.response";
import TestFundService from "../../services/service.test-fund";

const body_schema = z.object({
    email: z.string().email(),
    solLamports: z.coerce.number().int().nonnegative().optional(),
    usdcAmount: z.coerce.number().nonnegative().optional(),
});

function is_admin_email(email: string | null | undefined): boolean {
    if (!email) return false;
    const raw = process.env.ADMIN_EMAILS ?? "";
    if (!raw.trim()) return false;
    const allow = raw
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
    return allow.includes(email.toLowerCase());
}

export default class FundByEmailController {
    private static fund_service = new TestFundService();

    static async process(req: Request, res: Response) {
        if (!FundByEmailController.is_caller_admin(req)) {
            return ResponseWriter.not_authorized(res, "admin only");
        }

        const parsed = body_schema.safeParse(req.body ?? {});
        if (!parsed.success) {
            return ResponseWriter.invalid_data(res, "Invalid fund payload");
        }

        if (!FundByEmailController.fund_service.is_configured()) {
            return ResponseWriter.error(
                res,
                "ADMIN_KEYPAIR_MISSING",
                "SERVER_SOLANA_ADMIN_KEYPAIR is not set",
                undefined,
                503,
            );
        }

        const target = await FundByEmailController.lookup_user(parsed.data.email);
        if ("error" in target) {
            target.error(res);
            return;
        }

        await FundByEmailController.fund_and_respond(res, target.user, parsed.data);
    }

    private static is_caller_admin(req: Request): boolean {
        if (!req.user) return false;
        return is_admin_email(req.user.email);
    }

    private static async lookup_user(
        email: string,
    ): Promise<
        | { user: { id: string; email: string; custodialPublicKey: string | null } }
        | { error: (_res: Response) => void }
    > {
        const row = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
            select: { id: true, email: true, custodialPublicKey: true },
        });
        if (!row) {
            return {
                error: (res) =>
                    ResponseWriter.error(
                        res,
                        "USER_NOT_FOUND",
                        `no user with email ${email}`,
                        undefined,
                        404,
                    ),
            };
        }
        if (!row.custodialPublicKey) {
            return {
                error: (res) =>
                    ResponseWriter.error(
                        res,
                        "USER_NO_WALLET",
                        "user has not yet created a custodial wallet",
                        undefined,
                        409,
                    ),
            };
        }
        return { user: row };
    }

    private static async fund_and_respond(
        res: Response,
        user: { id: string; email: string; custodialPublicKey: string | null },
        body: { solLamports?: number; usdcAmount?: number },
    ): Promise<void> {
        try {
            const result = await FundByEmailController.fund_service.fund({
                userId: user.id,
                solLamports: body.solLamports,
                usdcAmount: body.usdcAmount,
            });
            ResponseWriter.success(
                res,
                {
                    email: user.email,
                    userId: user.id,
                    ...result,
                },
                "Funded",
            );
        } catch (err) {
            console.error("[admin/fund-by-email]", err);
            const msg = err instanceof Error ? err.message : "fund failed";
            ResponseWriter.error(res, "FUND_FAILED", msg, undefined, 500);
        }
    }
}
