import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { auth: session } = req;
  const isLoggedIn = !!session?.user;
  const { pathname } = req.nextUrl;

  // Allow access to login page and auth API
  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  // Redirect to login if not authenticated
  if (!isLoggedIn) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - /api/auth (authentication endpoints)
     * - /login (login page)
     * - /_next/static (static files)
     * - /_next/image (image optimization files)
     * - /favicon.ico, /sitemap.xml, /robots.txt (public files)
     */
    '/((?!api/auth|login|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
