import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  // Standalone output for Docker — bundles all required node_modules
  output: 'standalone',

  // Required for pnpm monorepo: trace from monorepo root so symlinked deps
  // in root node_modules/.pnpm/ are included in standalone output.
  // Without this, standalone only traces from packages/sample-merchant.
  outputFileTracingRoot: path.join(__dirname, '../../'),

  // Prisma와 Next.js 16 (Turbopack) 호환성 설정
  serverExternalPackages: [
    '@prisma/client',
    '@prisma/adapter-mariadb',
    '@prisma/engines',
    'prisma',
  ],

  // Turbopack 설정
  turbopack: {},
};

export default nextConfig;
