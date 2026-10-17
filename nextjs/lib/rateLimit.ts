import { createHmac } from 'node:crypto'

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

/**
 * Fails closed: a missing key or a Convex error counts as limited, so a
 * misconfiguration surfaces as 429s instead of silently disabling the limit.
 */
export async function isRateLimited(headers: Headers, kind: 'search' | 'page'): Promise<boolean> {
  const key = process.env.RATE_LIMIT_TAG_KEY?.trim()
  if (!key) {
    console.error('[rate-limit] RATE_LIMIT_TAG_KEY is not configured')
    return true
  }

  const identifier = requestIdentifier(headers)
  const tag = createHmac('sha256', key).update(identifier).digest('hex')
  try {
    const result = await getConvexClient().mutation(convexApi.rateLimit.consume, { kind, identifier, tag })
    return !result.allowed
  } catch {
    // The Convex error can echo the arguments; log nothing from it.
    console.error('[rate-limit] enforcement failed')
    return true
  }
}
