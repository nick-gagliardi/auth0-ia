import { auth } from "@/lib/auth";

export default auth((req) => {
  // The auth function automatically handles authentication
  // If the request is not authenticated, it will redirect to the sign-in page
});

export const config = {
  matcher: [
    '/api/audit/:path*',
    '/api/pr-review/:path*',
    '/api/maintenance/:path*',
    '/api/curl-execute/:path*',
    '/api/settings/:path*',
  ],
};
