export interface AuthUser {
    id: string;
    email: string;
}

/* eslint-disable no-unused-vars */
declare global {
    namespace Express {
        interface Request {
            user?: AuthUser;
        }
    }
}
/* eslint-enable no-unused-vars */
