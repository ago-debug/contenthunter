/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true
  },
  output: 'standalone',
  transpilePackages: ['lucide-react'],
}

module.exports = nextConfig
