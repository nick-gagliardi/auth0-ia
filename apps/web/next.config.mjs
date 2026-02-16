/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  async redirects() {
    return [
      {
        source: '/broken-links',
        destination: '/work-queue',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
