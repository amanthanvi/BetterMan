import { ConvexHttpClient } from 'convex/browser'

let client: ConvexHttpClient | null = null

export function getConvexUrl(): string {
  // Convex detects the root test-only Vite dependency when writing local URLs.
  const value = process.env.NEXT_PUBLIC_CONVEX_URL?.trim() || process.env.CONVEX_URL?.trim() || process.env.VITE_CONVEX_URL?.trim()
  if (!value) {
    throw new Error('NEXT_PUBLIC_CONVEX_URL, CONVEX_URL, or VITE_CONVEX_URL is required')
  }
  return value
}

/** Base URL for Convex HTTP actions (`*.convex.site`), which serve the secret-gated server routes. */
export function getConvexSiteUrl(): string {
  const explicit = process.env.CONVEX_SITE_URL?.trim()
  if (explicit) return explicit

  const url = new URL(getConvexUrl())
  if (url.hostname.endsWith('.convex.cloud')) {
    url.hostname = `${url.hostname.slice(0, -'.convex.cloud'.length)}.convex.site`
    return url.origin
  }

  const local = process.env.VITE_CONVEX_SITE_URL?.trim()
  if (local) return local
  throw new Error('CONVEX_SITE_URL is required when the Convex URL is not a *.convex.cloud deployment')
}

export function getConvexClient(): ConvexHttpClient {
  if (!client) client = new ConvexHttpClient(getConvexUrl())
  return client
}
