/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true
  },
  output: 'standalone',
  transpilePackages: ['lucide-react'],
  // Suppress HMR (Hot Module Replacement) errors when running dev on a remote server
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Fix for axios/follow-redirects debug module in Next 15
      config.resolve.fallback = {
        ...config.resolve.fallback,
        debug: false,
      };
    }
    return config;
  },
}

module.exports = nextConfig
