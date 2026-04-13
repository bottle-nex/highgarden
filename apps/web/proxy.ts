import authMiddleware from "next-auth/middleware";

export default authMiddleware;

export const config = {
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico|images|videos|signin|api/auth|$).*)",
    ],
};
