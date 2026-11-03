import { Resend } from "resend";
import { ENV } from "../config/config.env";

let _resend: Resend | null = null;
function client(): Resend {
    if (!_resend) {
        _resend = new Resend(ENV.SERVER_RESEND_API_KEY);
    }
    return _resend;
}

export async function sendOtpEmail(
    to: string,
    code: string,
    withdrawal?: { destination: string; uiAmount: number },
) {
    const { error } = await client().emails.send({
        from: "Nocturn <noreply@nocturn.app>",
        to,
        subject: withdrawal
            ? "Confirm your Solmarket withdrawal"
            : `Your Solmarket signin code: ${code}`,
        text: withdrawal
            ? `Confirm withdrawal of ${withdrawal.uiAmount} USDC to ${withdrawal.destination} with code ${code}. This code expires in 10 minutes. If you did not request this, do not share or enter the code.`
            : `Your Solmarket signin code is ${code}.\n\nIt expires in ${Math.floor(
                  ENV.SERVER_OTP_TTL_SECONDS / 60,
              )} minutes. If you didn't request this, you can ignore this email.`,
    });

    if (error) {
        throw new Error(`resend send failed: ${error.message}`);
    }
}

export async function sendWithdrawalEmail(
    to: string,
    result: { destination: string; uiAmount: number; txSignature: string },
) {
    const { error } = await client().emails.send(
        {
            from: "Nocturn <noreply@nocturn.app>",
            to,
            subject: "Your Solmarket withdrawal was sent",
            text: `${result.uiAmount} USDC was sent to ${result.destination}.\nTransaction: ${result.txSignature}\nIf you did not authorize this withdrawal, contact support immediately.`,
        },
        { idempotencyKey: `withdrawal/${result.txSignature}` },
    );
    if (error) throw new Error(`resend send failed: ${error.message}`);
}
