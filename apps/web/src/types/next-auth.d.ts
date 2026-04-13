import type { ISODateString } from "next-auth";

export interface UserType {
    id?: string | null;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    provider?: string | null;
    token?: string | null;
}

declare module "next-auth" {
    interface Session {
        user?: UserType;
        expires: ISODateString;
    }

    interface User extends UserType {}
}

declare module "next-auth/jwt" {
    interface JWT {
        user?: UserType;
    }
}
