import { afterEach, expect, test, mock } from "bun:test";
import bcrypt from "bcryptjs";
import { fakeDatabase } from "./fixture";

const values = new Map<string, string>();
const redis = {
    get: async (key: string) => values.get(key) ?? null,
    incr: async (key: string) => {
        const n = Number(values.get(key) ?? 0) + 1;
        values.set(key, String(n));
        return n;
    },
    expire: async () => 1,
    eval: async (
        _script: string,
        _count: number,
        key: string,
        attempts: string,
        hash: string,
        limit: number,
    ) => {
        if (values.get(key) !== hash || Number(values.get(attempts) ?? 0) > limit) return 0;
        values.delete(key);
        values.delete(attempts);
        return 1;
    },
};
mock.module(new URL("../../index.ts", import.meta.url).pathname, () => ({
    services: { redis },
    socket_server: {},
}));
const { default: OtpService } = await import("../../services/service.otp");
const { default: OtpVerifyController } =
    await import("../../controllers/auth/controller.otp-verify");
afterEach(() => mock.restore());

test("parallel login-code consumption succeeds exactly once", async () => {
    values.clear();
    values.set(OtpService.code_key("user@example.com"), await bcrypt.hash("123456", 4));
    const results = await Promise.all([
        OtpService.verify_otp("user@example.com", "123456"),
        OtpService.verify_otp("user@example.com", "123456"),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
});

test("email-code login preserves the account and queues an alert", async () => {
    const db = fakeDatabase();
    values.clear();
    values.set(OtpService.code_key("user@example.com"), await bcrypt.hash("123456", 4));
    let status = 0;
    const response = {
        status(code: number) {
            status = code;
            return this;
        },
        json() {
            return this;
        },
    };
    await OtpVerifyController.process(
        { body: { email: "user@example.com", code: "123456" } } as never,
        response as never,
    );
    expect(status).toBe(200);
    expect(db.users[0]!.custodialSecretEncrypted).toBe("original-ciphertext");
    expect(db.notifications).toHaveLength(1);
});

test("every owner route inherits authentication and allowlist guards; manual settlement is absent", async () => {
    const { default: router } = await import("../../routers/admin/router.admin");
    const { requireAuth } = await import("../../middleware/middleware.auth");
    const { requireAdmin } = await import("../../middleware/middleware.admin");
    expect(router.stack[0]!.handle).toBe(requireAuth);
    expect(router.stack[1]!.handle).toBe(requireAdmin);
    expect(
        router.stack.some((layer: { route?: { path?: string } }) =>
            layer.route?.path?.includes("resolve-market"),
        ),
    ).toBe(false);
});
