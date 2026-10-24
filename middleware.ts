import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        // Allow access if token exists
        if (token) return true;
        return false;
      },
    },
    pages: {
      signIn: '/auth/login',
    },
  }
);

// Route protection is enforced inside each API handler (getServerSession →
// proper 401 JSON). Middleware only guards page routes: previously /api/*
// entries here caused unauthenticated API calls to return HTTP 200 with the
// login page HTML instead of 401 (audit finding C4).
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/analytics/:path*',
    '/watchlist/:path*',
    '/portfolio/:path*',
    '/profile/:path*',
  ],
};
