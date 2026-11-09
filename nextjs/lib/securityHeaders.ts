/** Non-HTML responses need no scripts, including when the proxy is skipped. */
export function nonHtmlSecurityHeaders(): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    ...(process.env.NODE_ENV === 'production' ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {}),
  }
}

/**
 * `/sw.js` skips the proxy too. A worker runs under the CSP of its own script, and its
 * `fetch()` passes pages, the API and assets through (connect-src), so it keeps 'self'.
 */
export function serviceWorkerSecurityHeaders(): Record<string, string> {
  return { ...nonHtmlSecurityHeaders(), 'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'" }
}
