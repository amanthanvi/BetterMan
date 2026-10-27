import type { NextConfig } from 'next'
import path from 'node:path'

import { reservedPathSegments } from './lib/reservedPathSegments'
import { nonHtmlSecurityHeaders } from './lib/securityHeaders'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname, '..'),
  env: {
    BM_RESERVED_PATH_SEGMENTS: reservedPathSegments(__dirname).join('/'),
  },
  async headers() {
    return [
      {
        source: '/assets/:path*',
        headers: Object.entries(nonHtmlSecurityHeaders()).map(([key, value]) => ({ key, value })),
      },
      {
        source: '/assets/site.js',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=3600, s-maxage=86400' }],
      },
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
        { source: '/assets/entry', destination: '/api/measurement/event' },
        {
          source: '/sitemap-:distro-:page.xml',
          destination: '/sitemaps-internal/:distro/:page',
        },
        {
          source: '/sitemap-:distro.xml',
          destination: '/sitemaps-internal/:distro',
        },
      ],
      // Concrete routes (notably robots.txt) win; these run before the short-URL catch-all.
      afterFiles: [
        { source: '/man/:name/:section.txt', destination: '/plain-text/:name/:section' },
        { source: '/:name.txt', destination: '/plain-text/:name' },
      ],
    }
  },
}

export default nextConfig
