import type { Request, Response } from "express";
import { ENV } from "../../config/config.env";
import { z } from "zod";
import { prisma } from "@solmarket/database";
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
        id_token: z.string().min(1),
    }),
});

export default class SignInController {
    static async process(req: Request, res: Response) {
        const parsed = body_schema.safeParse(req.body);
        if (!parsed.success) {
            return ResponseWriter.invalid_data(res, "Invalid sign-in payload");
        }
        // Google validates the signature; audience/issuer/expiry and verified email
        // are checked here before any account lookup or write.
        let identity;
        try {
            if (!ENV.SERVER_GOOGLE_CLIENT_ID) throw new Error("Google login disabled");
            const url = new URL("https://oauth2.googleapis.com/tokeninfo");
            url.searchParams.set("id_token", parsed.data.account.id_token);
            const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
            if (!response.ok) throw new Error("Invalid Google token");
            identity = z
                .object({
                    aud: z.literal(ENV.SERVER_GOOGLE_CLIENT_ID),
                    iss: z.enum(["accounts.google.com", "https://accounts.google.com"]),
                    exp: z.coerce.number().refine((n) => n > Date.now() / 1000),
                    email: z.email(),
                    email_verified: z.literal("true"),
                    sub: z.string().min(1),
                    name: z.string().optional(),
                    picture: z.string().optional(),
                })
                .parse(await response.json());
            if (identity.email.toLowerCase() !== parsed.data.user.email.toLowerCase()) {
                throw new Error("Email mismatch");
            }
        } catch {
            return ResponseWriter.not_authorized(res, "Google identity verification failed");
        }
        const { name, picture: image } = identity;
        const normalizedEmail = identity.email.toLowerCase();

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
