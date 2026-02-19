/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  publicRuntimeConfig: {
    gatewayApiUrl: process.env.GATEWAY_API_URL || 'http://localhost:3001',
    faucetApiUrl: process.env.FAUCET_API_URL || 'http://localhost:3003',
  },
  webpack: (config) => {
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    return config;
  },
};

module.exports = nextConfig;
