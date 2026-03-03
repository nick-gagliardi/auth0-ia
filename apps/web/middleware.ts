export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    '/api/audit/:path*',
    '/api/pr-review/:path*',
    '/api/maintenance/:path*',
    '/api/curl-execute/:path*',
    '/api/settings/:path*',
  ],
};
