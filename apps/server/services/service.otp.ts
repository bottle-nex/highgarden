import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { ENV } from "../config/config.env";
import { services } from "..";

export type OtpVerifyResult =
    | { ok: true }
    | { ok: false; reason: "expired" | "invalid" | "locked" };

export default class OtpService {
    static async store_otp(email: string, code: string): Promise<void> {
        const redis = services.redis;
        const hash = await bcrypt.hash(code, 10);
        const ttl = ENV.SERVER_OTP_TTL_SECONDS;

        const pipiline = redis.pipeline();
        pipiline.set(this.code_key(email), hash, "EX", ttl);
        pipiline.del(this.attempts_key(email));
        pipiline.set(this.cool_down_key(email), "1", "EX", ENV.SERVER_OTP_COOLDOWN_SECONDS);
        await pipiline.exec();
    }

    static async verify_otp(email: string, code: string): Promise<OtpVerifyResult> {
        const redis = services.redis;
        const hash = await redis.get(this.code_key(email));
        if (!hash) {
            return { ok: false, reason: "expired" };
        }

        const attempts = await redis.incr(this.attempts_key(email));
        if (attempts === 1) {
            await redis.expire(this.attempts_key(email), ENV.SERVER_OTP_TTL_SECONDS);
        }

        if (attempts > ENV.SERVER_OTP_MAX_ATTEMPTS) {
            const pipeline = redis.pipeline();
            pipeline.del(this.code_key(email));
            pipeline.del(this.attempts_key(email));
            await pipeline.exec();
            return { ok: false, reason: "locked" };
        }

        const matches = await bcrypt.compare(code, hash);
        if (!matches) {
            return { ok: false, reason: "invalid" };
        }

        // Compare-and-delete the exact hash, so concurrent verifications or a
        // newly issued code cannot consume the same approval twice.
        const consumed = await redis.eval(
            `
            if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
            if tonumber(redis.call('GET', KEYS[2]) or '0') > tonumber(ARGV[2]) then return 0 end
            redis.call('DEL', KEYS[1], KEYS[2])
            return 1
        `,
            2,
            this.code_key(email),
            this.attempts_key(email),
            hash,
            ENV.SERVER_OTP_MAX_ATTEMPTS,
        );
        return consumed === 1 ? { ok: true } : { ok: false, reason: "expired" };
    }

    static async is_cooldown(email: string): Promise<boolean> {
        const redis = services.redis;
        return (await redis.exists(this.cool_down_key(email))) === 1;
    }

    static generate_otp(): string {
        return randomInt(0, 1_000_000).toString().padStart(6, "0");
    }

    static code_key(email: string) {
        return `otp:${email.toLowerCase()}`;
    }
    static attempts_key(email: string) {
        return `otp:${email.toLowerCase()}:attempts`;
    }
    static cool_down_key(email: string) {
        return `otp:${email.toLowerCase()}:cooldown`;
    }
}
