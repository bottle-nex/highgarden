import jwt, { type SignOptions } from "jsonwebtoken";
import { ENV } from "../config/config.env";

export interface SessionClaims {
    sub: string;
    email: string;
    emailOtpVerified?: true;
}

export function signSessionJwt(claims: SessionClaims): string {
    return jwt.sign(claims, ENV.SERVER_AUTH_SECRET, {
        algorithm: "HS256",
        expiresIn: ENV.SERVER_AUTH_TOKEN_TTL as SignOptions["expiresIn"],
    });
}

export function verifySessionJwt(token: string): SessionClaims {
    const payload = jwt.verify(token, ENV.SERVER_AUTH_SECRET, {
        algorithms: ["HS256"],
    });

    if (typeof payload !== "object" || payload === null) {
        throw new Error("invalid token payload");
    }

    const { sub, email, emailOtpVerified } = payload as Record<string, unknown>;
    if (typeof sub !== "string" || typeof email !== "string") {
        throw new Error("missing sub or email claim");
    }

    return { sub, email, emailOtpVerified: emailOtpVerified === true ? true : undefined };
}
