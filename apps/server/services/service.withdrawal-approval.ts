import { createHmac, randomInt } from "node:crypto";
import { services } from "../index";
import { ENV } from "../config/config.env";
import { sendOtpEmail } from "./service.email";

export interface WithdrawalDetails {
    userId: string;
    destination: string;
    uiAmount: number;
}
const key = (id: string) => `withdrawal:approval:${id}`;
function digest(details: WithdrawalDetails, code: string) {
    return createHmac("sha256", ENV.SERVER_AUTH_SECRET)
        .update(JSON.stringify([details.userId, details.destination, details.uiAmount, code]))
        .digest("hex");
}

export async function requestWithdrawalApproval(details: WithdrawalDetails, email: string) {
    const redis = services.redis;
    const cooldown = await redis.set(`${key(details.userId)}:cooldown`, "1", "EX", 60, "NX");
    if (!cooldown) return false;
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    await redis.set(key(details.userId), digest(details, code), "EX", 600);
    await sendOtpEmail(email, code, details);
    return true;
}

export async function consumeWithdrawalApproval(details: WithdrawalDetails, code: string) {
    if (!/^\d{6}$/.test(code)) return false;
    // Atomic compare-and-delete prevents concurrent requests replaying an approval.
    // The withdrawal rate limiter also limits wrong guesses to five per hour/user.
    return (
        (await services.redis.eval(
            "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
            1,
            key(details.userId),
            digest(details, code),
        )) === 1
    );
}
