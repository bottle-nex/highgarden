import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "@solmarket/database";
import ResponseWriter from "../../services/service.response";
import { signSessionJwt } from "../../services/service.jwt";
import { ensure_user_has_keypair } from "../../services/service.keypair";
import { verifyGoogleIdentity } from "../../services/service.google-identity";

const body_schema = z.object({
    account: z.object({ provider: z.literal("google"), id_token: z.string().min(1) }),
});

export default class SignInController {
    static async process(req: Request, res: Response) {
        const parsed = body_schema.safeParse(req.body);
        if (!parsed.success) {
            return ResponseWriter.not_authorized(res, "Verified Google identity required");
        }

        let identity;
        try {
            identity = await verifyGoogleIdentity(parsed.data.account.id_token);
        } catch {
            return ResponseWriter.not_authorized(res, "Invalid Google identity");
        }
        const { email, name, image } = identity;
        const normalizedEmail = email.toLowerCase();
        try {
            const user = await prisma.user.upsert({
                where: { email: normalizedEmail },
                create: {
                    email: normalizedEmail,
                    name: name ?? null,
                    image: image ?? null,
                    emailVerified: new Date(),
                },
                update: {
                    name: name ?? undefined,
                    image: image ?? undefined,
                    emailVerified: new Date(),
                },
                select: { id: true, email: true, name: true, image: true },
            });

            const walletPublicKey = await ensure_user_has_keypair(user.id);
            const token = signSessionJwt({ sub: user.id, email: user.email });

            return ResponseWriter.success(
                res,
                { user: { ...user, walletPublicKey }, token },
                "Signed in",
            );
        } catch (err) {
            console.error("[sign-in]", err);
            return ResponseWriter.system_error(res);
        }
    }
}
