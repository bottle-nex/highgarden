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

// Only protect routes that require an authenticated user at the edge.
// `/dashboard`, `/event/*`, `/market/*`, `/legal/*`, and the landing page
// are publicly browsable — auth-required actions on those pages open the
// in-page sign-in modal (see useRequireAuth) instead of a redirect.
export const config = {
    matcher: ['/admin/:path*', '/portfolio/:path*', '/bookmarks/:path*'],
};
