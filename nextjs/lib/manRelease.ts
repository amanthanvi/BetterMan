import { api } from '../../convex/_generated/api'
import { getConvexClient } from './convexClient'
import { normalizeDistro, type Distro } from './distro'

/**
 * The active dataset release per distro, as the proxy sees it. Man page HTML is
 * cached at the edge under a URL that carries this release, so a promotion
 * changes every cache key within RELEASE_TTL_MS, with no purge. Each server
 * instance asks Convex at most once per distro per TTL; a cached page view costs
 * nothing more.
 */
export type ReleaseInfo = {
  datasetReleaseId: string
  distro: Distro
  pageCount: number
  lastUpdated: string
}

export const RELEASE_TTL_MS = 60_000
/** Forwards the release the cache key used to the renderer, for its footer and data-cache keys. */
export const RELEASE_HEADER = 'x-bm-release'
/**
 * Sent beside RELEASE_HEADER. The renderer trusts the release only with this
 * token, so a request that reached it some other way (a matcher gap, a direct
 * hit on the origin) cannot choose a cache key or the footer. The value is a
 * random secret inlined at build into server code only (next.config.ts).
 */
export const RELEASE_TOKEN_HEADER = 'x-bm-release-token'

export function releaseToken(): string {
  const token = process.env.BM_RELEASE_TOKEN
  if (!token) throw new Error('BM_RELEASE_TOKEN is not set')
  return token
}

/** The query parameter the proxy's rewrite adds; it exists only to key the CDN cache. */
export const RELEASE_PARAM = '__bm_release'

const releases = new Map<Distro, { at: number; value: Promise<ReleaseInfo | null> }>()

async function readRelease(distro: Distro): Promise<ReleaseInfo | null> {
  const info = await getConvexClient().query(api.queries.getInfo, { distro })
  if (info.datasetReleaseId === 'uninitialized') return null
  return { datasetReleaseId: info.datasetReleaseId, distro, pageCount: info.pageCount, lastUpdated: info.lastUpdated }
}

function cachedRelease(distro: Distro, now: number): Promise<ReleaseInfo | null> {
  const hit = releases.get(distro)
  if (hit && now - hit.at < RELEASE_TTL_MS) return hit.value
  // A failed read is kept for the same TTL: an outage must not turn every view into a Convex call.
  const value = readRelease(distro).catch(() => null)
  releases.set(distro, { at: now, value })
  return value
}

/** The release that serves `distro`: Debian's when the distro has none, since the pages fall back to Debian. */
export async function servingRelease(distro: Distro, now = Date.now()): Promise<ReleaseInfo | null> {
  const own = await cachedRelease(distro, now)
  if (own || distro === 'debian') return own
  return await cachedRelease('debian', now)
}

export function encodeReleaseHeader(info: ReleaseInfo): string {
  return JSON.stringify(info)
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

type HeaderValue = string | string[] | undefined | null

/** The release the proxy forwarded, or null when it lacks the proxy's token or is malformed. */
export function trustedRelease(headers: Record<string, HeaderValue>): ReleaseInfo | null {
  const token = [headers[RELEASE_TOKEN_HEADER]].flat()[0]
  if (!token || !process.env.BM_RELEASE_TOKEN || !constantTimeEqual(token, process.env.BM_RELEASE_TOKEN)) return null
  return decodeReleaseHeader(headers[RELEASE_HEADER])
}

/** Anything malformed reads as unknown. */
export function decodeReleaseHeader(value: HeaderValue): ReleaseInfo | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<ReleaseInfo>
    const distro = normalizeDistro(parsed.distro)
    if (!distro || typeof parsed.datasetReleaseId !== 'string' || !parsed.datasetReleaseId) return null
    if (typeof parsed.pageCount !== 'number' || !Number.isFinite(parsed.pageCount) || typeof parsed.lastUpdated !== 'string') return null
    return { datasetReleaseId: parsed.datasetReleaseId, distro, pageCount: parsed.pageCount, lastUpdated: parsed.lastUpdated }
  } catch {
    return null
  }
}

/** Test seam: forget cached releases. */
export function resetReleaseCache() {
  releases.clear()
}
