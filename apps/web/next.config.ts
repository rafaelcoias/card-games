import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle for the Docker image only; Vercel builds natively.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  outputFileTracingRoot: path.resolve(process.cwd(), '../..'),
  // Source-only workspace package (TSX); compiled by Next.
  transpilePackages: ['@cardroom/ui'],
  poweredByHeader: false,
  agentRules: false,
  async headers() {
    return [
      {
        source: '/cards/:file*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }],
      },
    ];
  },
};

export default nextConfig;
