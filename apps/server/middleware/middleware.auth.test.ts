import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import express from "express";
import jwt from "jsonwebtoken";

const secret = "comment-visibility-test-secret-at-least-32-characters";
mock.module("../config/config.env", () => ({
    ENV: { SERVER_AUTH_SECRET: secret, SERVER_AUTH_TOKEN_TTL: "7d" },
}));

const { optionalAuth, requireAuth } = await import("./middleware.auth");

const app = express();
app.get("/optional", optionalAuth, (req, res) => res.json({ user: req.user ?? null }));
app.get("/required", requireAuth, (req, res) => res.json({ user: req.user ?? null }));

let server: ReturnType<typeof app.listen>;
let base_url: string;

beforeAll(() => {
    server = app.listen(0, "127.0.0.1");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server has no port");
    base_url = `http://127.0.0.1:${address.port}`;
});

afterAll(() => server.close());

describe("optionalAuth", () => {
    test("allows anonymous readers", async () => {
        const res = await fetch(`${base_url}/optional`);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ user: null });
    });

    test("sets identity from a verified bearer token", async () => {
        const claims = { sub: "author", email: "author@example.com" };
        const token = jwt.sign(claims, secret, { algorithm: "HS256" });
        const res = await fetch(`${base_url}/optional`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ user: { id: claims.sub, email: claims.email } });
    });

    test.each([
        ["empty", ""],
        ["wrong scheme", "Basic author"],
        ["missing token", "Bearer "],
        ["malformed", "Bearer forged-author"],
        ["wrong signature", `Bearer ${jwt.sign({ sub: "author", email: "a@b.c" }, "wrong")}`],
        [
            "expired",
            `Bearer ${jwt.sign({ sub: "author", email: "a@b.c" }, secret, { expiresIn: -1 })}`,
        ],
        ["missing claims", `Bearer ${jwt.sign({ sub: "author" }, secret)}`],
    ])("rejects %s credentials", async (_label, authorization) => {
        const res = await fetch(`${base_url}/optional`, { headers: { authorization } });
        expect(res.status).toBe(401);
        expect(await res.json()).toMatchObject({ success: false });
    });

    test("keeps required authentication mandatory", async () => {
        const res = await fetch(`${base_url}/required`);
        expect(res.status).toBe(401);
    });
});
