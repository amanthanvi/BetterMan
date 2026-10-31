import { NextResponse, type NextRequest } from 'next/server'

import { DISTRO_COOKIE, normalizeDistro } from './lib/distro'
import { resolvePublicLang } from './lib/i18n/gate'
import { DEFAULT_LANG, LANG_COOKIE, LANG_PARAM, type Lang } from './lib/i18n/locales'
import { LANG_HEADER } from './lib/i18n/request'
import { translationFixHref } from './lib/i18n/fix'
import { LANG_SWITCH_PATH, FIX_PATH, pathInLang, safeLocalPath } from './lib/i18n/switch'
import { analyticsConfig } from './lib/analyticsConfig'
import { analyticsBootScriptHash } from './lib/analyticsBoot'
import { manBootScriptHash } from './lib/manBoot'
import { normalizeManQuery } from './lib/manQuery'
import { encodeReleaseHeader, RELEASE_HEADER, RELEASE_PARAM, RELEASE_TOKEN_HEADER, releaseToken, servingRelease, UNKNOWN_RELEASE, type ReleaseInfo } from './lib/manRelease'

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

async function cachedPageScriptHashes(): Promise<string[]> {
  return [await manBootScriptHash(), ...(analyticsConfig() ? [await analyticsBootScriptHash()] : [])]
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

/** `/concept/<slug>`, the explainers the Pages Router renders as plain HTML (pages/concept). */
export function isConceptHtmlPath(pathname: string): boolean {
  return /^\/concept\/[^/]+$/.test(pathname)
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
 * One cache entry per meaning: anything outside the man URL query allowlist
 * (lib/manQuery.ts) is redirected away before it can render or key the CDN,
 * whatever the request's headers. Next has already dropped a client fetch's
 * `_rsc` and decoded unreserved escapes (`%2D` is `-`) by now, so a real client
 * fetch passes, and the release-keyed rewrite is built from the canonical query.
 */
function manQueryRedirect(request: NextRequest, csp: string | null): NextResponse | null {
  const url = request.nextUrl
  const canonical = normalizeManQuery(url.pathname, url.search)
  if (canonical === null) return null
  const target = url.clone()
  target.search = canonical
  const response = NextResponse.redirect(target, 308)
  response.headers.set('Cache-Control', 'private, no-store')
  return setSecurityHeaders(response, csp)
}

/**
 * The remembered language, when this URL names none and it is not English. The
 * language comes from the URL alone, so a bare URL cannot be rendered in it:
 * the reader is sent to the explicit `?lang=` URL, privately, as for the distro.
 * `/-/lang/en` is the way back to English: it remembers English, so the bare URL stays.
 */
function rememberedLang(request: NextRequest): Lang | null {
  if (resolvePublicLang(request.nextUrl.searchParams.get(LANG_PARAM))) return null
  const preferred = resolvePublicLang(request.cookies.get(LANG_COOKIE)?.value)
  return preferred && preferred !== DEFAULT_LANG ? preferred : null
}

/**
 * Man pages are cached at the edge (see pages/man), so their HTML never depends
 * on a cookie. A bare URL serves Debian in English; a reader whose default distro
 * or language is another one is sent to the explicit URL, privately. Explicit
 * URLs, and bare ones without such a cookie, are rewritten to carry the active
 * release, which keys the cache.
 */
async function manProxy(request: NextRequest, cspEnabled: boolean, text = false): Promise<NextResponse> {
  const url = request.nextUrl
  const explicit = normalizeDistro(url.searchParams.get('distro'))
  const preferred = normalizeDistro(request.cookies.get(DISTRO_COOKIE)?.value)
  // The plain-text export is upstream text and has no interface to translate.
  const remembered = text ? null : rememberedLang(request)
  const csp = cspEnabled ? text
    ? buildCsp([`'nonce-${createNonce()}'`], { strictDynamic: true })
    : buildCsp(await cachedPageScriptHashes(), { strictDynamic: false }) : null

  const redirect = manQueryRedirect(request, csp)
  if (redirect) return redirect

  const sendToDistro = !text && !explicit && preferred && preferred !== 'debian'
  if (sendToDistro || remembered) {
    const target = url.clone()
    target.searchParams.delete(RELEASE_PARAM)
    if (sendToDistro) target.searchParams.set('distro', preferred)
    if (remembered) target.searchParams.set(LANG_PARAM, remembered)
    const response = NextResponse.redirect(target, 307)
    response.headers.set('Cache-Control', 'private, no-store')
    return setSecurityHeaders(response, csp)
  }

  const release = await releaseWithin(explicit ?? 'debian')
  const requestHeaders = new Headers(request.headers)
  requestHeaders.delete(RELEASE_HEADER)
  requestHeaders.delete(RELEASE_TOKEN_HEADER)
  requestHeaders.set(RELEASE_HEADER, release ? encodeReleaseHeader(release) : UNKNOWN_RELEASE)
  // Proves to the renderer that this proxy, not the client, set the release.
  requestHeaders.set(RELEASE_TOKEN_HEADER, releaseToken())
  if (isLoopback(request)) return setSecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), csp)
  const target = url.clone()
  target.searchParams.set(RELEASE_PARAM, release?.datasetReleaseId ?? UNKNOWN_RELEASE)
  return setSecurityHeaders(NextResponse.rewrite(target, { request: { headers: requestHeaders } }), csp)
}

/**
 * Home keeps a typed query in `/?q=` for its inline results, which arrive as
 * client (RSC) navigations. A full document load of that URL, such as a shared
 * link or a reader without JavaScript, would stream behind home's loading
 * skeleton; the search page renders the same results in the HTML instead.
 */
function homeQueryRedirect(request: NextRequest): NextResponse | null {
  const { pathname, searchParams } = request.nextUrl
  if (pathname !== '/' || !searchParams.get('q')?.trim()) return null
  // Client navigations are fetches, not documents; any of these marks one.
  const headers = request.headers
  const clientFetch = headers.has('rsc') || headers.has('next-router-state-tree') || searchParams.has('_rsc') ||
    headers.get('sec-fetch-dest') === 'empty'
  if (clientFetch) return null
  const target = request.nextUrl.clone()
  target.pathname = '/search'
  return NextResponse.redirect(target, 307)
}

/** Paths with a file extension (assets, `robots.txt`, sitemaps, `/tar.txt`) and the API are not pages to translate. */
function isPagePath(pathname: string): boolean {
  return !/^\/(?:api|assets|_next|_bm|fonts)(?:\/|$)/.test(pathname) && !/\.[A-Za-z0-9]+$/.test(pathname) && !/\/(?:og|opengraph-image)$/.test(pathname)
}

/** A document navigation to a bare App Router URL, by a reader who remembers a language: send it to the explicit URL. */
function langRedirect(request: NextRequest): NextResponse | null {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null
  if (!request.headers.get('accept')?.includes('text/html')) return null
  if (!isPagePath(request.nextUrl.pathname)) return null
  const remembered = rememberedLang(request)
  if (!remembered) return null
  const target = request.nextUrl.clone()
  target.searchParams.set(LANG_PARAM, remembered)
  const response = NextResponse.redirect(target, 307)
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

/** The page a reader came from, when it is on this site; the switch links carry no URL of their own on App Router pages. */
function refererPath(request: NextRequest): string | null {
  try {
    const from = new URL(request.headers.get('referer') ?? '')
    if (from.host !== request.headers.get('host') || from.pathname.startsWith('/-/')) return null
    return `${from.pathname}${from.search}`
  } catch {
    return null
  }
}

/**
 * `/-/lang/<code>` remembers a language (a cookie, on a private redirect) and returns to the page with
 * that language in its URL; `/-/fix/<code>` opens the translation-fix issue for the page. Plain links,
 * so the switch needs no script (lib/i18n/switch.ts). An unknown or unreviewed code changes nothing.
 */
function languageLink(request: NextRequest): NextResponse | null {
  const match = new RegExp(`^(${LANG_SWITCH_PATH}|${FIX_PATH})/([^/]+)$`).exec(request.nextUrl.pathname)
  if (!match || (request.method !== 'GET' && request.method !== 'HEAD')) return null
  let code: string
  try {
    code = decodeURIComponent(match[2])
  } catch {
    code = ''
  }
  const lang = resolvePublicLang(code)
  const to = safeLocalPath(request.nextUrl.searchParams.get('to')) ?? refererPath(request) ?? '/'
  const target = request.nextUrl.clone()
  const place = (path: string) => {
    const url = new URL(path, 'https://example.invalid')
    url.searchParams.delete(RELEASE_PARAM)
    target.pathname = url.pathname
    target.search = url.search
    target.hash = ''
  }
  let response: NextResponse
  if (match[1] === FIX_PATH) {
    response = lang && lang !== DEFAULT_LANG ? NextResponse.redirect(translationFixHref({ lang, page: to }), 307) : (place(to), NextResponse.redirect(target, 307))
  } else {
    place(lang ? pathInLang(to, lang) : to)
    response = NextResponse.redirect(target, 307)
    // Secure wherever the site is served over HTTPS; plain-http localhost (dev, tests) could not keep it in every browser.
    const https = request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https'
    if (lang) response.cookies.set(LANG_COOKIE, lang, { path: '/', maxAge: 31536000, sameSite: 'lax', secure: https })
  }
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

export async function proxy(request: NextRequest) {
  const switched = languageLink(request)
  if (switched) return setSecurityHeaders(switched, null)
  const redirect = homeQueryRedirect(request)
  if (redirect) return setSecurityHeaders(redirect, null)
  const cspEnabled = process.env.CSP_ENABLED !== 'false'
  if (isManHtmlPath(request.nextUrl.pathname)) return await manProxy(request, cspEnabled)
  // Explainers depend only on the URL and the deployment: the man pages' hash-only CSP, no nonce, no cookie.
  if (isConceptHtmlPath(request.nextUrl.pathname)) {
    const csp = cspEnabled ? buildCsp(await cachedPageScriptHashes(), { strictDynamic: false }) : null
    return manQueryRedirect(request, csp) ?? setSecurityHeaders(NextResponse.next(), csp)
  }
  const path = request.nextUrl.pathname
  // Keep root concrete .txt routes in sync with the afterFiles rewrites in next.config.ts.
  if (/^\/man\/[^/]+\/[^/]+\.txt$/.test(path) || (/^\/[^/]+\.txt$/.test(path) && path !== '/robots.txt')) {
    return await manProxy(request, cspEnabled, true)
  }

  // Share images are cached for a day, so their query is held to the allowlist too.
  if (/^\/man\/[^/]+\/[^/]+\/og$/.test(path)) {
    const imageRedirect = manQueryRedirect(request, null)
    if (imageRedirect) return imageRedirect
  }

  const toLang = langRedirect(request)
  if (toLang) return setSecurityHeaders(toLang, cspEnabled ? buildCsp([`'nonce-${createNonce()}'`], { strictDynamic: true }) : null)

  // The language the renderer shows, from the URL alone; whatever a client sent in this header is dropped.
  const pageHeaders = new Headers(request.headers)
  pageHeaders.delete(LANG_HEADER)
  pageHeaders.delete(RELEASE_TOKEN_HEADER)
  const urlLang = resolvePublicLang(request.nextUrl.searchParams.get(LANG_PARAM))
  if (urlLang) {
    pageHeaders.set(LANG_HEADER, urlLang)
    // Proves to the renderer that this proxy, not the client, set the language (prefetches skip the proxy).
    pageHeaders.set(RELEASE_TOKEN_HEADER, releaseToken())
  }

  if (!cspEnabled) return setSecurityHeaders(NextResponse.next({ request: { headers: pageHeaders } }), null)

  const nonce = createNonce()
  const csp = buildCsp([`'nonce-${nonce}'`], { strictDynamic: true })

  const requestHeaders = pageHeaders
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
    // Concept explainers are edge-cached too: a prefetch must still get the CSP,
    // the security headers and the query redirect, or the CDN could keep a bare page.
    { source: '/concept/:path*' },
    { source: '/:name.txt' },
  ],
}
