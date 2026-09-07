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

export function getConvexClient(): ConvexHttpClient {
  if (!client) client = new ConvexHttpClient(getConvexUrl())
  return client
}
