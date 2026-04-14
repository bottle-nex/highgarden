import { Resend } from "resend";
import { ENV } from "../config/config.env";

let _resend: Resend | null = null;
function client(): Resend {
    if (!_resend) {
        _resend = new Resend(ENV.SERVER_RESEND_API_KEY);
    }
    return _resend;
}

export async function sendOtpEmail(to: string, code: string) {
    const { error } = await client().emails.send({
        from: "Nocturn <noreply@nocturn.app>",
        to,
        subject: `Your Solmarket signin code: ${code}`,
        text: `Your Solmarket signin code is ${code}.\n\nIt expires in ${Math.floor(
            ENV.SERVER_OTP_TTL_SECONDS / 60,
        )} minutes. If you didn't request this, you can ignore this email.`,
    });

    if (error) {
        throw new Error(`resend send failed: ${error.message}`);
    }
}
