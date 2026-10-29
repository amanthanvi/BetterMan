import { NextResponse, type NextRequest } from 'next/server'

import { DISTRO_COOKIE, normalizeDistro } from './lib/distro'
import { manBootScriptHash } from './lib/manBoot'
import { encodeReleaseHeader, RELEASE_HEADER, RELEASE_PARAM, RELEASE_TOKEN_HEADER, releaseToken, servingRelease, type ReleaseInfo } from './lib/manRelease'

function createNonce(): string {
  return btoa(crypto.randomUUID())
}

/** `scripts` are the CSP sources beyond 'self': a per-request nonce, or the man page boot script's hash. */
function buildCsp(scripts: string[], { strictDynamic }: { strictDynamic: boolean }): string {
  const isDev = process.env.NODE_ENV === 'development'
  const sentryEnabled = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN?.trim())

  const connectSrc = [`'self'`]
  if (sentryEnabled) connectSrc.push('https://*.sentry.io')
  const sources = [`'self'`, ...scripts].join(' ')

  const csp = [
    `default-src 'self'`,
    `base-uri 'self'`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
    `form-action 'self'`,
    `script-src ${sources}${strictDynamic ? " 'strict-dynamic'" : ''}${isDev ? " 'unsafe-eval'" : ''}`,
    `script-src-elem ${sources}${isDev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self'`,
    `connect-src ${connectSrc.join(' ')}`,
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ]

  return csp.join('; ')
}

function setSecurityHeaders(response: NextResponse, csp: string | null) {
  if (csp) response.headers.set('Content-Security-Policy', csp)
  response.headers.set('x-content-type-options', 'nosniff')
  response.headers.set('referrer-policy', 'strict-origin-when-cross-origin')
  response.headers.set('x-frame-options', 'DENY')
  response.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()')
  if (process.env.NODE_ENV !== 'development') {
    response.headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains')
  }
  return response
}

/** `/man/<name>` and `/man/<name>/<section>`, the HTML pages the Pages Router renders; not the `/man/<name>/<section>.txt` export. */
export function isManHtmlPath(pathname: string): boolean {
  return /^\/man\/[^/]+(?:\/[^/]+)?$/.test(pathname) && !/^\/man\/[^/]+\/[^/]+\.txt$/.test(pathname)
}

/**
 * Next normalises a loopback host in middleware URLs to `localhost`, so behind
 * `next start -H 127.0.0.1` (the budget harness) a rewrite no longer matches the
 * server's own origin and is proxied as external. The release key exists for a
 * CDN, which never sends loopback hosts; there the page is served unkeyed by URL
 * but still gets the release header.
 */
function isLoopback(request: NextRequest): boolean {
  const host = request.headers.get('host') ?? ''
  return /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?$/.test(host)
}

// Ask Convex at most this long for the active release; past it the page renders under an unknown key.
const RELEASE_LOOKUP_TIMEOUT_MS = 1500

async function releaseWithin(distro: Parameters<typeof servingRelease>[0]): Promise<ReleaseInfo | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), RELEASE_LOOKUP_TIMEOUT_MS)
  })
  try {
    return await Promise.race([servingRelease(distro), timeout])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Man pages are cached at the edge (see pages/man), so their HTML never depends
 * on a cookie. A bare URL serves Debian; a reader whose default distro is another
 * one is sent to the explicit URL, privately. Explicit URLs, and bare ones without
 * such a cookie, are rewritten to carry the active release, which keys the cache.
 */
async function manProxy(request: NextRequest, cspEnabled: boolean): Promise<NextResponse> {
  const url = request.nextUrl
  const explicit = normalizeDistro(url.searchParams.get('distro'))
  const preferred = normalizeDistro(request.cookies.get(DISTRO_COOKIE)?.value)
  const csp = cspEnabled ? buildCsp([await manBootScriptHash()], { strictDynamic: false }) : null

  if (!explicit && preferred && preferred !== 'debian') {
    const target = url.clone()
    target.searchParams.delete(RELEASE_PARAM)
    target.searchParams.set('distro', preferred)
    const response = NextResponse.redirect(target, 307)
    response.headers.set('Cache-Control', 'private, no-store')
    return setSecurityHeaders(response, csp)
  }

  const release = await releaseWithin(explicit ?? 'debian')
  const requestHeaders = new Headers(request.headers)
  requestHeaders.delete(RELEASE_HEADER)
  requestHeaders.delete(RELEASE_TOKEN_HEADER)
  if (release) {
    requestHeaders.set(RELEASE_HEADER, encodeReleaseHeader(release))
    // Proves to the renderer that this proxy, not the client, set the release.
    requestHeaders.set(RELEASE_TOKEN_HEADER, releaseToken())
  }
  if (isLoopback(request)) return setSecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), csp)
  const target = url.clone()
  target.searchParams.set(RELEASE_PARAM, release?.datasetReleaseId ?? 'unknown')
  return setSecurityHeaders(NextResponse.rewrite(target, { request: { headers: requestHeaders } }), csp)
}

export async function proxy(request: NextRequest) {
  const cspEnabled = process.env.CSP_ENABLED !== 'false'
  if (isManHtmlPath(request.nextUrl.pathname)) return await manProxy(request, cspEnabled)

  if (!cspEnabled) return setSecurityHeaders(NextResponse.next(), null)

  const nonce = createNonce()
  const csp = buildCsp([`'nonce-${nonce}'`], { strictDynamic: true })

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)

  return setSecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), csp)
}

export const config = {
  matcher: [
    {
      source: '/((?!api(?:/|$)|assets(?:/|$)|_bm(?:/|$)|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
    // Man page prefetches get the release key too, so they are cacheable and a
    // client cannot reach the renderer past the proxy with its own release header.
    { source: '/man/:path*' },
  ],
}
