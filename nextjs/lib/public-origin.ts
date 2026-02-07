function normalizeBaseUrl(raw: string | undefined): string | null {
  const value = raw?.trim()
  if (!value) return null
  return value.endsWith('/') ? value.slice(0, -1) : value
}

function firstHeaderValue(raw: string | null): string | null {
  if (!raw) return null
  const first = raw.split(',')[0]?.trim()
  return first || null
}

export function getPublicOrigin(request: Request): string {
  const env =
    normalizeBaseUrl(process.env.PUBLIC_BASE_URL) ??
    normalizeBaseUrl(process.env.NEXT_PUBLIC_BASE_URL)
  if (env) {
    try {
      return new URL(env).origin
    } catch {
      return env
    }
  }

  const railwayPublicDomain = normalizeBaseUrl(process.env.RAILWAY_PUBLIC_DOMAIN)
  if (railwayPublicDomain) return `https://${railwayPublicDomain}`

  const host =
    firstHeaderValue(request.headers.get('x-forwarded-host')) ??
    firstHeaderValue(request.headers.get('host'))
  if (host) {
    const proto =
      firstHeaderValue(request.headers.get('x-forwarded-proto')) ??
      (request.url.startsWith('https:') ? 'https' : 'http')
    return `${proto}://${host}`
  }

  return new URL(request.url).origin
}
