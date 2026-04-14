import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "@solmarket/database";
import ResponseWriter from "../../services/service.response";
import { signSessionJwt } from "../../services/service.jwt";

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

      const token = signSessionJwt({ sub: user.id, email: user.email });

      return ResponseWriter.success(res, { user, token }, "Signed in");
    } catch (err) {
      console.error("[sign-in]", err);
      return ResponseWriter.system_error(res);
    }
  }
}
