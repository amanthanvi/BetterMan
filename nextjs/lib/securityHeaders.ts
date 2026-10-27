/** Non-HTML responses need no scripts, including when the proxy is skipped. */
export function nonHtmlSecurityHeaders(): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    ...(process.env.NODE_ENV === 'production' ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {}),
  }
}
