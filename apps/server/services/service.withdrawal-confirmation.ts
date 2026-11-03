import { createHmac, randomInt } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { services } from "../index";
import { ENV } from "../config/config.env";
import { sendWithdrawalEmail } from "./service.email";

interface Withdrawal {
    userId: string;
    email: string;
    destination: string;
    uiAmount: number;
}

export function validWithdrawal(destination: string, amount: number): boolean {
    if (
        !Number.isFinite(amount) ||
        amount < 1 ||
        !Number.isSafeInteger(Math.round(amount * 1_000_000)) ||
        Math.abs(amount * 1_000_000 - Math.round(amount * 1_000_000)) > 0.000001
    )
        return false;
    try {
        new PublicKey(destination);
        return true;
    } catch {
        return false;
    }
}

function digest(input: Withdrawal, code: string): string {
    return createHmac("sha256", ENV.SERVER_AUTH_SECRET)
        .update(JSON.stringify([input.userId, input.destination, input.uiAmount, code]))
        .digest("hex");
}

export async function requestWithdrawalConfirmation(input: Withdrawal): Promise<boolean> {
    const redis = services.redis;
    const key = `withdrawal:${input.userId}`;
    if (!(await redis.set(`${key}:cooldown`, "1", "EX", 60, "NX"))) return false;
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    await redis.set(key, JSON.stringify({ digest: digest(input, code), attempts: 0 }), "EX", 600);
    try {
        await sendWithdrawalEmail(
            input.email,
            "Confirm your withdrawal",
            `To authorize sending ${input.uiAmount} USDC to ${input.destination}, enter ${code}. This code expires in 10 minutes. Never share it. If this wasn't you, do not approve it.`,
        );
    } catch (error) {
        await redis.del(key);
        throw error;
    }
    return true;
}

export async function consumeWithdrawalConfirmation(
    input: Withdrawal,
    code: string,
): Promise<boolean> {
    // Check, count failures and consume atomically, including concurrent requests.
    const result = await services.redis.eval(
        `
        local raw = redis.call('GET', KEYS[1])
        if not raw then return 0 end
        local value = cjson.decode(raw)
        if value.digest == ARGV[1] then
            redis.call('DEL', KEYS[1])
            return 1
        end
        value.attempts = value.attempts + 1
        if value.attempts >= 5 then redis.call('DEL', KEYS[1])
        else redis.call('SET', KEYS[1], cjson.encode(value), 'KEEPTTL') end
        return 0
    `,
        1,
        `withdrawal:${input.userId}`,
        digest(input, code),
    );
    return result === 1;
}
