export function getCanonicalUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const url = new URL(window.location.href)
    url.hash = ''
    return url.toString()
  } catch {
    return undefined
  }
}

export function getCspNonce(): string | undefined {
  if (typeof document === 'undefined') return undefined
  const el = document.querySelector('script[nonce]') as HTMLScriptElement | null
  const nonce = el?.nonce || el?.getAttribute('nonce') || undefined
  return nonce && nonce.trim().length ? nonce : undefined
}

export function safeJsonLdStringify(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

