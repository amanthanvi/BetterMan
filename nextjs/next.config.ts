import type { NextConfig } from 'next'
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from 'next/constants'
import { randomBytes } from 'node:crypto'
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
    const securityHeaders = Object.entries(nonHtmlSecurityHeaders()).map(([key, value]) => ({ key, value }))
    return [
      {
        source: '/assets/:path*',
        headers: securityHeaders,
      },
      {
        // The man page script; production names carry a content hash (scripts/build-man-client.mjs).
        source: '/_bm/:path*',
        headers: [
          ...securityHeaders,
          {
            key: 'Cache-Control',
            value: process.env.NODE_ENV === 'production' ? 'public, max-age=31536000, immutable' : 'no-store',
          },
        ],
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
      // Concrete routes (notably robots.txt) win; keep proxy.ts's root .txt exclusions in sync.
      afterFiles: [
        { source: '/man/:name/:section.txt', destination: '/plain-text/:name/:section' },
        { source: '/:name.txt', destination: '/plain-text/:name' },
      ],
    }
  },
}

/** The man pages (pages/man) load a static script that Next does not build; bundle it with the app. */
export default async function config(phase: string): Promise<NextConfig> {
  if (phase !== PHASE_PRODUCTION_BUILD && phase !== PHASE_DEVELOPMENT_SERVER) return nextConfig
  const { buildManClient, watchManClient } = await import('./scripts/build-man-client.mjs')
  const script = phase === PHASE_PRODUCTION_BUILD ? await buildManClient(__dirname) : await watchManClient(__dirname)
  // A per-build secret the proxy hands the man page renderer with the release (lib/manRelease.ts).
  // Only server code reads it, so it is never part of a client bundle.
  const releaseToken = randomBytes(32).toString('base64url')
  return { ...nextConfig, env: { ...nextConfig.env, BM_MAN_SCRIPT: script, BM_RELEASE_TOKEN: releaseToken } }
}

export { nextConfig }
