import { auth } from "@/lib/auth";

export default auth((req) => {
  // The auth function automatically handles authentication
  // If the request is not authenticated, it will redirect to the sign-in page
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
