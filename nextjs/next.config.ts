import type { NextConfig } from 'next'
import path from 'node:path'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname, '..'),
  async headers() {
    return [
      // Metadata is proxy-exempt so cached output never carries a request nonce.
      ...[
        '/robots.txt', '/opensearch.xml', '/sitemap.xml', '/sitemap-:file.xml',
        '/sitemaps-internal/:path*', '/opengraph-image',
      ].map((source) => ({
        source,
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          ...(process.env.NODE_ENV === 'development' ? [] : [
            { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          ]),
        ],
      })),
      {
        // Font binaries are content-stable; cache them immutably.
        source: '/fonts/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/favicon.ico',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }],
      },
      {
        source: '/favicon.svg',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }],
      },
      {
        source: '/favicon-16.png',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }],
      },
      {
        source: '/favicon-32.png',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }],
      },
      {
        source: '/apple-touch-icon.png',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }],
      },
      {
        source: '/icon-192.png',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }],
      },
      {
        source: '/icon-512.png',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }],
      },
      {
        source: '/betterman-mark.svg',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }],
      },
    ]
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          // Generate the release index on first access, not during a backend-free build.
          source: '/sitemap.xml',
          destination: '/sitemaps-internal/index',
        },
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
