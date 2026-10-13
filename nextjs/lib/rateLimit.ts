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

export async function isRateLimited(headers: Headers, kind: 'search' | 'page'): Promise<boolean> {
  const key = process.env.RATE_LIMIT_TAG_KEY
  if (!key?.trim()) {
    if (process.env.NODE_ENV !== 'production' && process.env.BETTERMAN_RATE_LIMIT_DEV_BYPASS === '1') return false
    // eslint-disable-next-line no-console -- Fail-closed diagnostics contain no request or secret data.
    console.error('[rate-limit] RATE_LIMIT_TAG_KEY is not configured')
    return true
  }

  try {
    const identifier = requestIdentifier(headers)
    const tag = createHmac('sha256', key).update(identifier).digest('hex')
    const result = await getConvexClient().mutation(convexApi.rateLimit.enforce, { kind, identifier, tag })

    return !result.allowed
  } catch {
    // Convex errors may contain arguments; never log identifiers, tags, or keys.
    // eslint-disable-next-line no-console -- Never emit the underlying Convex error or its arguments.
    console.error('[rate-limit] enforcement failed')
    return true
  }
}
