import { createPublicKey, type JsonWebKey } from "node:crypto";
import jwt from "jsonwebtoken";
import { ENV } from "../config/config.env";

let cache: { keys: (JsonWebKey & { kid?: string })[]; expires: number } | undefined;
export async function verifyGoogleIdentity(token: string) {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || decoded.header.alg !== "RS256" || !decoded.header.kid)
        throw new Error("Invalid proof");
    if (!cache || cache.expires < Date.now()) {
        const response = await fetch("https://www.googleapis.com/oauth2/v3/certs", {
            signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error("Identity keys unavailable");
        const body = (await response.json()) as { keys: (JsonWebKey & { kid?: string })[] };
        cache = { keys: body.keys, expires: Date.now() + 300000 };
    }
    const key = cache.keys.find((v) => v.kid === decoded.header.kid);
    if (!key) throw new Error("Unknown Google key");
    const claims = jwt.verify(
        token,
        createPublicKey({ key, format: "jwk" }).export({ type: "spki", format: "pem" }).toString(),
        {
            algorithms: ["RS256"],
            audience: ENV.SERVER_GOOGLE_CLIENT_ID,
            issuer: ["accounts.google.com", "https://accounts.google.com"],
        },
    );
    if (
        typeof claims === "string" ||
        typeof claims.exp !== "number" ||
        !claims.sub ||
        claims.email_verified !== true ||
        typeof claims.email !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email)
    )
        throw new Error("Unverified identity");
    return {
        email: claims.email,
        name: typeof claims.name === "string" ? claims.name : null,
        image: typeof claims.picture === "string" ? claims.picture : null,
    };
}
