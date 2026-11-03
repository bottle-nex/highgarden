import jwt from "jsonwebtoken";
import { ENV } from "../config/config.env";

let certificates: Record<string, string> = {};
let expires_at = 0;

/** Only Google's signed identity, for this application's audience, can choose a user. */
export async function verifyGoogleIdentity(token: string) {
    if (!ENV.GOOGLE_CLIENT_ID) throw new Error("GOOGLE_CLIENT_ID is not configured");
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || decoded.header.alg !== "RS256" || !decoded.header.kid) {
        throw new Error("Invalid Google token header");
    }
    if (Date.now() >= expires_at) {
        const response = await fetch("https://www.googleapis.com/oauth2/v1/certs", {
            signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) throw new Error("Google certificates unavailable");
        certificates = (await response.json()) as Record<string, string>;
        expires_at = Date.now() + 300_000;
    }
    const certificate = certificates[decoded.header.kid];
    if (!certificate) throw new Error("Unknown Google signing key");
    const claims = jwt.verify(token, certificate, {
        algorithms: ["RS256"],
        audience: ENV.GOOGLE_CLIENT_ID,
        issuer: ["https://accounts.google.com", "accounts.google.com"],
    });
    if (
        typeof claims !== "object" ||
        !claims.sub ||
        !claims.exp ||
        claims.email_verified !== true ||
        typeof claims.email !== "string"
    ) {
        throw new Error("Verified Google email required");
    }
    return {
        email: claims.email,
        name: typeof claims.name === "string" ? claims.name : null,
        image: typeof claims.picture === "string" ? claims.picture : null,
    };
}
