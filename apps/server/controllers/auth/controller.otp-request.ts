import type { Request, Response } from "express";
import { z } from "zod";
import ResponseWriter from "../../services/service.response";
import { sendOtpEmail } from "../../services/service.email";
import OtpService from "../../services/service.otp";

const body_schema = z.object({
    email: z.email(),
});

export default class OtpRequestController {
    static async process(req: Request, res: Response) {
        const parsed = body_schema.safeParse(req.body);
        if (!parsed.success) {
            return ResponseWriter.invalid_data(res, "Valid email required");
        }
        const email = parsed.data.email.toLowerCase();

        try {
            if (await OtpService.is_cooldown(email)) {
                return ResponseWriter.custom(
                    res,
                    false,
                    "OTP_COOLDOWN",
                    "Please wait before requesting another code",
                    429,
                );
            }

            const code = OtpService.generate_otp();
            await OtpService.store_otp(email, code);
            await sendOtpEmail(email, code);

            return ResponseWriter.success(res, { ok: true }, "OTP sent");
        } catch (err) {
            console.error("[otp-request]", err);
            return ResponseWriter.system_error(res);
        }
    }
}
