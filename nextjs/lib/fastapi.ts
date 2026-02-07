function normalizeBaseUrl(raw: string | undefined): string {
  const value = raw?.trim() || ''
  if (!value) return 'http://127.0.0.1:8000'
  return value.endsWith('/') ? value.slice(0, -1) : value
}

export function fastapiUrl(path: string): string {
  const base = normalizeBaseUrl(process.env.FASTAPI_INTERNAL_URL)
  if (path.startsWith('/')) return `${base}${path}`
  return `${base}/${path}`
}

