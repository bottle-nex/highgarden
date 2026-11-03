import { afterAll, expect, mock, test } from "bun:test";
import jwt from "jsonwebtoken";
import express from "express";
import type { Request, Response, NextFunction } from "express";

const env = {
    SERVER_AUTH_SECRET: "a".repeat(32),
    SERVER_AUTH_TOKEN_TTL: "7d",
    SERVER_AUTH_BRIDGE_SECRET: "b".repeat(32),
    ADMIN_EMAILS: "owner@example.com",
};
mock.module("../config/config.env", () => ({ ENV: env }));
const upsert = mock(async () => ({ id: "victim", email: "victim@example.com" }));
mock.module("@solmarket/database", () => ({ prisma: { user: { upsert } } }));
mock.module("../services/service.keypair", () => ({
    ensure_user_has_keypair: async () => "wallet",
}));
const values = new Map<string, string>();
const redis = {
    set: async (key: string, value: string, ...options: unknown[]) => {
        if (options.includes("NX") && values.has(key)) return null;
        values.set(key, value);
        return "OK";
    },
    del: async (key: string) => values.delete(key),
    // In-memory implementation of the atomic Redis script's storage contract.
    eval: async (_script: string, _keys: number, key: string, digest: string) => {
        const raw = values.get(key);
        if (!raw) return 0;
        const value = JSON.parse(raw);
        if (value.digest === digest) {
            values.delete(key);
            return 1;
        }
        value.attempts++;
        if (value.attempts >= 5) values.delete(key);
        else values.set(key, JSON.stringify(value));
        return 0;
    },
};
mock.module("../index", () => ({ services: { redis } }));
mock.module("../services/service.wallet", () => ({ get_user_usdc_balance: async () => ({}) }));
mock.module("../services/service.portfolio", () => ({ default: class {} }));
const transfer = mock(async () => ({ txSignature: "signature" }));
mock.module("../services/service.solana-withdraw", () => ({
    default: class {
        withdraw_usdc = transfer;
    },
    WithdrawError: class extends Error {},
}));
const sent = mock(async (_to: string, _subject: string, _text?: string) => {});
mock.module("../services/service.email", () => ({ sendOtpEmail: sent, sendWithdrawalEmail: sent }));
const pass = (_req: Request, _res: Response, next: NextFunction) => next();
mock.module("../middleware/middleware.rate-limit", () => ({
    rate_limiters: { read: pass, mutate: pass, withdraw: pass, admin_strict: pass },
}));
for (const name of [
    "list-pending",
    "list-listings",
    "listing-counts",
    "approve",
    "approve-and-list",
    "reject",
    "resolve-market",
    "run-lister",
    "diagnostic",
    "test-fund",
    "fund-by-email",
    "balances",
    "fast-subscriptions",
]) {
    const ok = (_req: Request, res: Response) => res.json({ reached: true });
    mock.module(`../controllers/admin/controller.${name}`, () => ({
        default: { process: ok, list: ok, create: ok, remove: ok },
    }));
}
const { default: SignIn } = await import("../controllers/auth/controller.sign-in");
const { default: admin } = await import("../routers/admin/router.admin");
const { default: users } = await import("../routers/users/router.user");
const { signSessionJwt, verifySessionJwt } = await import("../services/service.jwt");
const app = express();
app.use(express.json());
app.post("/sign-in", SignIn.process);
app.use("/admin", admin);
app.use("/users", users);
const server = app.listen(0);
const address = server.address();
if (!address || typeof address === "string") throw new Error("No port");
const base = `http://127.0.0.1:${address.port}`;
afterAll(() => server.close());
const token = signSessionJwt({ sub: "victim", email: "victim@example.com" });
const headers = { "content-type": "application/json", authorization: `Bearer ${token}` };

test("email alone cannot create a session or mutate the account", async () => {
    const response = await fetch(`${base}/sign-in`, {
        method: "POST",
        headers,
        body: JSON.stringify({
            user: { email: "victim@example.com" },
            account: { provider: "google" },
        }),
    });
    expect(response.status).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
});

test("every owner endpoint rejects anonymous callers and ordinary members", async () => {
    for (const [method, path] of [
        ["GET", "pending"],
        ["GET", "listings"],
        ["GET", "listings/counts"],
        ["GET", "diagnostic"],
        ["POST", "approve/m"],
        ["POST", "approve-and-list/m"],
        ["POST", "reject/m"],
        ["POST", "resolve-market/m"],
        ["POST", "lister/run"],
        ["POST", "test-fund/u"],
        ["POST", "fund-by-email"],
        ["GET", "balances"],
        ["GET", "fast-subscriptions"],
        ["POST", "fast-subscriptions"],
        ["DELETE", "fast-subscriptions/id"],
    ]) {
        expect((await fetch(`${base}/admin/${path}`, { method })).status).toBe(401);
        expect((await fetch(`${base}/admin/${path}`, { method, headers })).status).toBe(403);
    }
});

test("a session alone cannot transfer money without email confirmation", async () => {
    const response = await fetch(`${base}/users/me/withdraw`, {
        method: "POST",
        headers,
        body: JSON.stringify({ destination: "recipient", uiAmount: 10 }),
    });
    expect(response.status).toBe(400);
    expect(transfer).not.toHaveBeenCalled();
});

test("old potentially forged sessions are invalidated", () => {
    const oldToken = jwt.sign(
        { sub: "victim", email: "victim@example.com" },
        env.SERVER_AUTH_SECRET,
    );
    expect(() => verifySessionJwt(oldToken)).toThrow();
    expect(verifySessionJwt(token).sub).toBe("victim");
});

test("owner access requires a verified owner and manual winner selection is unavailable", async () => {
    const owner = signSessionJwt({ sub: "owner", email: "owner@example.com" });
    const ownerHeaders = { authorization: `Bearer ${owner}` };
    expect((await fetch(`${base}/admin/balances`, { headers: ownerHeaders })).status).toBe(200);
    expect(
        (await fetch(`${base}/admin/resolve-market/m`, { method: "POST", headers: ownerHeaders }))
            .status,
    ).toBe(404);
    env.ADMIN_EMAILS = "";
    expect((await fetch(`${base}/admin/balances`, { headers: ownerHeaders })).status).toBe(403);
    env.ADMIN_EMAILS = "owner@example.com";
});

test("trusted Google callback can sign in and missing bridge configuration fails closed", async () => {
    const body = JSON.stringify({
        user: { email: "victim@example.com" },
        account: { provider: "google" },
    });
    const bridgeHeaders = { ...headers, "x-auth-bridge-secret": env.SERVER_AUTH_BRIDGE_SECRET };
    expect(
        (await fetch(`${base}/sign-in`, { method: "POST", headers: bridgeHeaders, body })).status,
    ).toBe(200);
    env.SERVER_AUTH_BRIDGE_SECRET = "";
    expect(
        (await fetch(`${base}/sign-in`, { method: "POST", headers: bridgeHeaders, body })).status,
    ).toBe(401);
    env.SERVER_AUTH_BRIDGE_SECRET = "b".repeat(32);
});

test("withdrawal codes bind the recipient and amount, are single use, and send notices", async () => {
    values.clear();
    sent.mockClear();
    transfer.mockClear();
    const destination = "11111111111111111111111111111111";
    const body = { destination, uiAmount: 10 };
    const request = (path: string, data: object) =>
        fetch(`${base}/users/me/withdraw${path}`, {
            method: "POST",
            headers,
            body: JSON.stringify(data),
        });
    expect((await request("/confirmation", body)).status).toBe(200);
    const code = String(sent.mock.calls[0]?.[2]).match(/enter (\d{6})/)?.[1];
    expect(code).toBeDefined();
    expect((await request("/confirmation", body)).status).toBe(429);
    expect((await request("", { ...body, uiAmount: 11, code })).status).toBe(400);
    expect(
        (
            await request("", {
                ...body,
                destination: "So11111111111111111111111111111111111111112",
                code,
            })
        ).status,
    ).toBe(400);
    expect(transfer).not.toHaveBeenCalled();
    expect((await request("", { ...body, code })).status).toBe(200);
    expect(transfer).toHaveBeenCalledTimes(1);
    expect(sent).toHaveBeenCalledTimes(3);
    expect((await request("", { ...body, code })).status).toBe(400);
    expect(transfer).toHaveBeenCalledTimes(1);
});

test("withdrawal confirmation locks after five failures and rejects missing challenges", async () => {
    const { requestWithdrawalConfirmation, consumeWithdrawalConfirmation } =
        await import("../services/service.withdrawal-confirmation");
    values.clear();
    sent.mockClear();
    const input = {
        userId: "other",
        email: "other@example.com",
        destination: "11111111111111111111111111111111",
        uiAmount: 1.000001,
    };
    await requestWithdrawalConfirmation(input);
    const code = String(sent.mock.calls[0]?.[2]).match(/enter (\d{6})/)![1]!;
    const wrong = ((Number(code) + 1) % 1000000).toString().padStart(6, "0");
    for (let i = 0; i < 5; i++)
        expect(await consumeWithdrawalConfirmation(input, wrong)).toBe(false);
    expect(await consumeWithdrawalConfirmation(input, code)).toBe(false);
    expect(await consumeWithdrawalConfirmation({ ...input, userId: "missing" }, code)).toBe(false);
});

test("concurrent withdrawal approvals spend each code once", async () => {
    const { requestWithdrawalConfirmation, consumeWithdrawalConfirmation } =
        await import("../services/service.withdrawal-confirmation");
    values.clear();
    sent.mockClear();
    const input = {
        userId: "concurrent",
        email: "other@example.com",
        destination: "11111111111111111111111111111111",
        uiAmount: 2,
    };
    await requestWithdrawalConfirmation(input);
    const code = String(sent.mock.calls[0]?.[2]).match(/enter (\d{6})/)![1]!;
    expect(
        await Promise.all([
            consumeWithdrawalConfirmation(input, code),
            consumeWithdrawalConfirmation(input, code),
        ]),
    ).toEqual([true, false]);
});

test("email delivery failure prevents a withdrawal", async () => {
    values.clear();
    sent.mockClear();
    transfer.mockClear();
    const body = { destination: "11111111111111111111111111111111", uiAmount: 10 };
    await fetch(`${base}/users/me/withdraw/confirmation`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });
    const code = String(sent.mock.calls[0]?.[2]).match(/enter (\d{6})/)![1]!;
    sent.mockImplementationOnce(async () => {
        throw new Error("Mail unavailable");
    });
    const originalError = console.error;
    console.error = () => {};
    try {
        expect(
            (
                await fetch(`${base}/users/me/withdraw`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({ ...body, code }),
                })
            ).status,
        ).toBe(500);
        expect(transfer).not.toHaveBeenCalled();
    } finally {
        console.error = originalError;
    }
});
