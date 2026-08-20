type PublicOriginSource = {
  url?: string
  headers?: {
    get(name: string): string | null
  }
}

function parseConfiguredOrigin(raw: string | undefined, variable: string): string | null {
  const value = raw?.trim()
  if (!value) return null

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${variable} must be an absolute HTTP(S) origin`)
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${variable} must use http:// or https://`)
  }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${variable} must contain only an origin, without credentials, a path, query, or fragment`)
  }

  return url.origin
}

function firstHeaderValue(raw: string | null): string | null {
  if (!raw) return null
  const first = raw.split(',')[0]?.trim()
  return first || null
}

function getConfiguredPublicOrigin(): string | null {
  return (
    parseConfiguredOrigin(process.env.PUBLIC_BASE_URL, 'PUBLIC_BASE_URL') ??
    parseConfiguredOrigin(process.env.NEXT_PUBLIC_BASE_URL, 'NEXT_PUBLIC_BASE_URL')
  )
}

function getDevelopmentOrigin(source: PublicOriginSource): string {
  if (source.url) {
    const url = new URL(source.url)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Request URL must use http:// or https://')
    }
    return url.origin
  }

  const host = firstHeaderValue(source.headers?.get('host') ?? null)
  if (host) {
    return new URL(`http://${host}`).origin
  }

  return 'http://localhost:3000'
}

export function getPublicOrigin(source: PublicOriginSource = {}): string {
  const configured = getConfiguredPublicOrigin()
  if (configured) return configured

  if (process.env.NODE_ENV === 'production') {
    throw new Error('PUBLIC_BASE_URL is required in production')
  }

  return getDevelopmentOrigin(source)
}
