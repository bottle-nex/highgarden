import type { Request, Response } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { prisma } from "@solmarket/database";
import { ENV } from "../../config/config.env";
import ResponseWriter from "../../services/service.response";
import { signSessionJwt } from "../../services/service.jwt";
import { ensure_user_has_keypair } from "../../services/service.keypair";

const body_schema = z.object({
    user: z.object({
        email: z.email(),
        name: z.string().nullish(),
        image: z.string().nullish(),
    }),
    account: z.object({
        provider: z.enum(["google"]),
    }),
});

export default class SignInController {
    static async process(req: Request, res: Response) {
        const secret = ENV.GOOGLE_SIGN_IN_SHARED_SECRET;
        const authorization = req.headers.authorization;
        if (
            !secret ||
            !authorization ||
            !timingSafeEqual(
                createHash("sha256").update(authorization).digest(),
                createHash("sha256").update(`Bearer ${secret}`).digest(),
            )
        ) {
            return ResponseWriter.not_authorized(res);
        }

        const parsed = body_schema.safeParse(req.body);
        if (!parsed.success) {
            return ResponseWriter.invalid_data(res, "Invalid sign-in payload");
        }
        const { email, name, image } = parsed.data.user;
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
