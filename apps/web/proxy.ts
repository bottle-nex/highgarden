import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import { isAdminEmail } from '@/lib/auth/admin';

export default withAuth(
    function middleware(req) {
        if (req.nextUrl.pathname.startsWith('/admin')) {
            const user = (req.nextauth.token?.user ?? {}) as { email?: string };
            if (!isAdminEmail(user.email)) {
                return NextResponse.redirect(new URL('/dashboard', req.url));
            }
        }
        return NextResponse.next();
    },
    {
        callbacks: {
            authorized: ({ token }) => !!token,
        },
    },
);

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico|images|videos|signin|api/auth|$).*)'],
};
