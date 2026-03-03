/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true
  },
  output: 'standalone',
  transpilePackages: ['lucide-react'],
  // Suppress HMR (Hot Module Replacement) errors when running dev on a remote server
  devIndicators: {
    appIsrStatus: false,
    buildActivity: false,
  },
}

module.exports = nextConfig
