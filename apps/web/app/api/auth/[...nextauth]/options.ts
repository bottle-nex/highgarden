import type { NextAuthOptions, Account, ISODateString } from "next-auth";
import type { JWT } from "next-auth/jwt";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import axios from "axios";
import { SIGNIN_URL, VERIFY_OTP_URL } from "@/routes/routes.api";

export interface UserType {
    id?: string | null;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    provider?: string | null;
    token?: string | null;
}

export interface CustomSession {
    user?: UserType;
    expires: ISODateString;
}

export const authOption: NextAuthOptions = {
    session: { strategy: "jwt" },
    pages: {
        signIn: "/signin",
    },
    callbacks: {
        async signIn({ user, account }: { user: UserType; account: Account | null }) {
            try {
                if (account?.provider === "google") {
                    const response = await axios.post(SIGNIN_URL, {
                        user,
                        account,
                    });

                    const result = response.data;

                    if (result?.success) {
                        user.id = result.data.user.id.toString();
                        user.token = result.data.token;
                        user.provider = "google";
                        return true;
                    }
                    return false;
                }

                if (account?.provider === "email-otp") {
                    return !!user;
                }

                return false;
            } catch (err) {
                console.error("[next-auth signIn]", err);
                return false;
            }
        },
        async jwt({ token, user }) {
            if (user) {
                token.user = user as UserType;
            }
            return token;
        },
        async session({ session, token }: { session: CustomSession; token: JWT }) {
            session.user = token.user as UserType;
            return session;
        },
    },
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID || "",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
            authorization: {
                params: {
                    prompt: "consent",
                    access_type: "offline",
                    response_type: "code",
                },
            },
        }),
        CredentialsProvider({
            id: "email-otp",
            name: "Email OTP",
            credentials: {
                email: { label: "Email", type: "email" },
                code: { label: "Code", type: "text" },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.code) return null;

                try {
                    const response = await axios.post(VERIFY_OTP_URL, {
                        email: credentials.email,
                        code: credentials.code,
                    });

                    const result = response.data;

                    if (result?.success) {
                        const { user, token } = result.data;
                        return {
                            id: user.id.toString(),
                            name: user.name ?? null,
                            email: user.email,
                            image: user.image ?? null,
                            provider: "email-otp",
                            token,
                        };
                    }

                    return null;
                } catch {
                    return null;
                }
            },
        }),
    ],
};
