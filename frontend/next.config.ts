import type { NextConfig } from 'next'

// In Docker Compose the backend is reachable at http://backend:8000 (server-side).
// Locally, set API_URL=http://localhost:8000 in .env.local.
const API_URL = process.env.API_URL ?? 'http://localhost:8000'

const nextConfig: NextConfig = {
  output: 'standalone',
  webpack: (config) => {
    config.resolve.alias.canvas = false
    return config
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_URL}/api/:path*`,
      },
    ]
  },
}

export default nextConfig
