import { api as convexApi } from '../../convex/_generated/api'

import { getConvexClient } from '@/lib/convexClient'

function first(value: string | null): string | undefined {
  const trimmed = value?.trim()
  return trimmed || undefined
}

/**
 * Client identity for Convex rate-limit buckets.
 *
 * Public callers can send CF-Connecting-IP, X-Forwarded-For, and (on a
 * directly reachable origin) X-Real-IP. Those headers must not split buckets.
 * Vercel overwrites `x-vercel-forwarded-for` at the trusted ingress; use that
 * when present. Otherwise share the anonymous subject rather than trust
 * spoofable forwarding headers.
 */
export function requestIdentifier(headers: Headers): string {
  const vercel = first(headers.get('x-vercel-forwarded-for'))
  if (vercel) return vercel.split(',')[0]?.trim() || 'anonymous'
  return 'anonymous'
}

export async function isRateLimited(headers: Headers, kind: 'search' | 'page'): Promise<boolean> {
  const result = await getConvexClient().mutation(convexApi.rateLimit.enforce, {
    kind,
    identifier: requestIdentifier(headers),
  })

  return !result.allowed
}
