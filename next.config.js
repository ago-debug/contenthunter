/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true
  },
  output: 'standalone',
  transpilePackages: ['lucide-react'],
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
  },
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false };
    // Ignore optional dependencies that might be missing
    config.module.noParse = /debug\/src\/browser\.js/;
    return config;
  }
}

module.exports = nextConfig
