/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true
  },
  output: 'standalone',
  /** Cheerio/parse5: bundling su alcuni host Linux può far fallire `next build` per /api/search-images */
  serverExternalPackages: ['cheerio'],
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
