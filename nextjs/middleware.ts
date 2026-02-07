import { NextResponse, type NextRequest } from 'next/server'

function createNonce(): string {
  return btoa(crypto.randomUUID())
}

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === 'development'
  const plausibleEnabled = Boolean(process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN?.trim())
  const sentryEnabled = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN?.trim())

  const connectSrc = [`'self'`]
  if (plausibleEnabled) connectSrc.push('https://plausible.io')
  if (sentryEnabled) connectSrc.push('https://*.sentry.io')

  const csp = [
    `default-src 'self'`,
    `base-uri 'self'`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
    `form-action 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self'`,
    `connect-src ${connectSrc.join(' ')}`,
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ]

  return csp.join('; ')
}

export function middleware(request: NextRequest) {
  const cspEnabled = process.env.CSP_ENABLED !== 'false'

  if (!cspEnabled) {
    const response = NextResponse.next()
    response.headers.set('x-content-type-options', 'nosniff')
    response.headers.set('referrer-policy', 'strict-origin-when-cross-origin')
    response.headers.set('x-frame-options', 'DENY')
    response.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()')

    if (process.env.NODE_ENV !== 'development') {
      response.headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains')
    }

    return response
  }

  const nonce = createNonce()
  const csp = buildCsp(nonce)

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })

  response.headers.set('Content-Security-Policy', csp)
  response.headers.set('x-content-type-options', 'nosniff')
  response.headers.set('referrer-policy', 'strict-origin-when-cross-origin')
  response.headers.set('x-frame-options', 'DENY')
  response.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()')

  if (process.env.NODE_ENV !== 'development') {
    response.headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains')
  }

  return response
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
