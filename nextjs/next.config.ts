import type { NextConfig } from 'next'
import path from 'node:path'

import { reservedPathSegments } from './lib/reservedPathSegments'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname, '..'),
  env: {
    BM_RESERVED_PATH_SEGMENTS: reservedPathSegments(__dirname).join('/'),
  },
  async headers() {
    return [
      {
        // Font file names carry no content hash, so cache long but not immutable.
        source: '/fonts/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=2592000' }],
      },
      {
        source:
          '/:icon(favicon\\.ico|favicon\\.svg|favicon-16\\.png|favicon-32\\.png|apple-touch-icon\\.png|icon-192\\.png|icon-512\\.png|betterman-mark\\.svg)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }],
      },
    ]
  },
  async rewrites() {
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
    }
  },
}

export default nextConfig
