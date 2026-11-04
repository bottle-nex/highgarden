import { afterEach, beforeEach, expect, test, spyOn, mock } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import jwt from "jsonwebtoken";
import type { Request, Response as ExpressResponse } from "express";
import { fakeDatabase } from "./fixture";
import { ENV } from "../../config/config.env";
const { signSessionJwt, verifySessionJwt } = await import("../../services/service.jwt");
const { verifyGoogleIdentity } = await import("../../services/service.google-identity");
const { requireAuth } = await import("../../middleware/middleware.auth");
const { requireAdmin } = await import("../../middleware/middleware.admin");
const { default: SignInController } = await import("../../controllers/auth/controller.sign-in");
const { enqueueLoginAlert } = await import("../../services/service.notification-outbox");

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const wrongKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...keys.publicKey.export({ format: "jwk" }), kid: "test-key" };
function proof(overrides: Record<string, unknown> = {}, wrong = false) {
    return jwt.sign(
        JSON.parse(
            JSON.stringify({
                sub: "google-user",
                email: "user@example.com",
                email_verified: true,
                iss: "https://accounts.google.com",
                aud: ENV.SERVER_GOOGLE_CLIENT_ID,
                exp: Math.floor(Date.now() / 1000) + 300,
                ...overrides,
            }),
        ),
        (wrong ? wrongKeys : keys).privateKey.export({ type: "pkcs8", format: "pem" }),
        { algorithm: "RS256", keyid: "test-key" },
    );
}
function response() {
    let status = 200;
    let body: unknown;
    const res = {
        status(code: number) {
            status = code;
            return this;
        },
        json(value: unknown) {
            body = value;
            return this;
        },
    } as ExpressResponse;
    return { res, status: () => status, body: () => body };
}
beforeEach(() => {
    spyOn(global, "fetch").mockResolvedValue(Response.json({ keys: [jwk] }));
});
afterEach(() => mock.restore());

test("Google proof verifies its signature and verified identity", async () => {
    expect((await verifyGoogleIdentity(proof())).email).toBe("user@example.com");
    for (const claims of [
        { email_verified: false },
        { aud: "attacker" },
        { iss: "attacker" },
        { exp: 1 },
        { exp: undefined },
        { sub: "" },
    ]) {
        await expect(verifyGoogleIdentity(proof(claims))).rejects.toThrow();
    }
    await expect(verifyGoogleIdentity(proof({}, true))).rejects.toThrow();
    await expect(
        verifyGoogleIdentity(jwt.sign({ email: "owner@example.com" }, "attacker")),
    ).rejects.toThrow();
});

test("email-only sign-in never reaches account storage", async () => {
    const db = fakeDatabase();
    const res = response();
    await SignInController.process(
        {
            body: { user: { email: "owner@example.com" }, account: { provider: "google" } },
        } as Request,
        res.res,
    );
    expect(res.status()).toBe(400);
    expect(db.prisma.user.upsert).not.toHaveBeenCalled();
});

test("session version rejects old HTTP and WebSocket tokens while retaining seven-day issuance", () => {
    const token = signSessionJwt({ sub: "u1", email: "user@example.com" });
    expect(verifySessionJwt(token).sub).toBe("u1");
    const payload = jwt.decode(token) as jwt.JwtPayload;
    expect(payload.exp! - payload.iat!).toBe(7 * 24 * 3600);
    const old = jwt.sign({ sub: "u1", email: "owner@example.com" }, ENV.SERVER_AUTH_SECRET);
    expect(() => verifySessionJwt(old)).toThrow();
    const res = response();
    const next = mock(() => {});
    requireAuth({ headers: { authorization: `Bearer ${old}` } } as Request, res.res, next);
    expect(res.status()).toBe(401);
    expect(next).not.toHaveBeenCalled();
});

test("owner middleware denies missing, ordinary and empty-allowlist sessions before side effects", () => {
    for (const user of [undefined, { id: "u1", email: "user@example.com" }]) {
        const res = response(),
            next = mock(() => {});
        requireAdmin({ user } as Request, res.res, next);
        expect(res.status()).toBe(user ? 403 : 401);
        expect(next).not.toHaveBeenCalled();
    }
    const next = mock(() => {});
    requireAdmin(
        { user: { id: "owner", email: " OWNER@example.com " } } as Request,
        response().res,
        next,
    );
    expect(next).toHaveBeenCalledTimes(1);
    const allowlist = ENV.ADMIN_EMAILS;
    ENV.ADMIN_EMAILS = "";
    const denied = response();
    requireAdmin(
        { user: { id: "owner", email: "owner@example.com" } } as Request,
        denied.res,
        next,
    );
    expect(denied.status()).toBe(403);
    ENV.ADMIN_EMAILS = allowlist;
});

test("successful login alerts are durable and preserve account and wallet fields", async () => {
    const db = fakeDatabase();
    const before = structuredClone(db.users);
    await enqueueLoginAlert("user@example.com");
    expect(db.notifications).toHaveLength(1);
    expect(db.notifications[0]!.acceptedAt).toBeNull();
    expect(db.users).toEqual(before);
});

test("verified Google login keeps the existing user and encrypted wallet", async () => {
    const db = fakeDatabase();
    const res = response();
    await SignInController.process(
        { body: { idToken: proof(), user: { email: "attacker@example.com" } } } as Request,
        res.res,
    );
    expect(res.status()).toBe(200);
    expect(db.users).toHaveLength(1);
    expect(db.users[0]!.id).toBe("u1");
    expect(db.users[0]!.custodialPublicKey).toBe("original-wallet");
    expect(db.users[0]!.custodialSecretEncrypted).toBe("original-ciphertext");
    expect(db.notifications).toHaveLength(1);
});
