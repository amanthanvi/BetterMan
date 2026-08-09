import { ConvexHttpClient } from 'convex/browser'

let client: ConvexHttpClient | null = null

export function getConvexUrl(): string {
  const value = process.env.NEXT_PUBLIC_CONVEX_URL?.trim() || process.env.CONVEX_URL?.trim()
  if (!value) {
    throw new Error('NEXT_PUBLIC_CONVEX_URL or CONVEX_URL is required')
  }
  return value
}

export function getConvexClient(): ConvexHttpClient {
  if (!client) client = new ConvexHttpClient(getConvexUrl())
  return client
}
