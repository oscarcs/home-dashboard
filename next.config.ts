import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/styles/:path*',
        destination: '/api/static/styles/:path*',
      },
      {
        source: '/assets/:path*',
        destination: '/api/static/assets/:path*',
      },
    ];
  },
};

export default nextConfig;
