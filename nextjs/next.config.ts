import type { NextConfig } from 'next'
import path from 'node:path'

function normalizeBaseUrl(raw: string | undefined): string | null {
  const value = raw?.trim()
  if (!value) return null
  return value.endsWith('/') ? value.slice(0, -1) : value
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname, '..'),
  async rewrites() {
    const fastapi = normalizeBaseUrl(process.env.FASTAPI_INTERNAL_URL) ?? 'http://127.0.0.1:8000'
    return {
      beforeFiles: [
        {
          source: '/sitemap-:distro-:page.xml',
          destination: '/sitemaps-internal/:distro/:page',
        },
        {
          source: '/sitemap-:distro.xml',
          destination: '/sitemaps-internal/:distro',
        },
      ],
      afterFiles: [
        {
          source: '/api/:path*',
          destination: `${fastapi}/api/:path*`,
        },
      ],
    }
  },
}

export default nextConfig
