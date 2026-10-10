import { getConvexSiteUrl } from '@/lib/convexClient'

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

function rateLimitSecret(): string {
  const value = process.env.CONVEX_RATE_LIMIT_SECRET?.trim()
  if (!value) throw new Error('CONVEX_RATE_LIMIT_SECRET is required')
  return value
}

export async function isRateLimited(headers: Headers, kind: 'search' | 'page'): Promise<boolean> {
  const response = await fetch(`${getConvexSiteUrl().replace(/\/+$/, '')}/rate-limit/enforce`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${rateLimitSecret()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ kind, identifier: requestIdentifier(headers) }),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Convex rate limit check failed: HTTP ${response.status}`)

  const result = (await response.json()) as { allowed?: unknown } | null
  if (typeof result?.allowed !== 'boolean') throw new Error('Convex rate limit check returned no decision')
  return !result.allowed
}
