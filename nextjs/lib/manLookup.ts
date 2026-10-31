import {
  FastApiError,
  fetchManByNameAndSectionOrAlias,
  fetchManDistros,
  fetchManResolve,
  fetchRelated,
  suggest,
  withDistroFallback,
  answeredBy,
  servedRelease,
  type ManAlias,
  type ManResolveResult,
  type RelatedResponse,
  type Suggestion,
} from './api'
import type { Distro } from './distro'
import type { ManPageResponse } from './docModel'
import { isRateLimited } from './rateLimit'
import { isManName } from './shortUrl'

/**
 * Lookups for the man page renderer (pages/man). They read no cookies and no
 * request state beyond their arguments, so a response depends only on its URL
 * and the active release, and the CDN can cache it.
 */

/**
 * Every outcome names the release that answered it (`servedRelease`), so a
 * route can share it under the proxy's release key only when the two agree.
 */
type Served = { servedRelease: string | null }
export type ManPageLookup =
  | ({ kind: 'page'; distro: Distro; data: ManPageResponse; related: RelatedResponse['items'] } & Served)
  | ({ distro: Distro } & ManAlias & Served)
  | ({ kind: 'miss' } & Served)

type Missing = { missing: true; servedRelease: string | null }

async function orMissing<T>(lookup: Promise<T>): Promise<T | Missing> {
  try {
    return await lookup
  } catch (err) {
    if (err instanceof FastApiError && err.status === 404) return { missing: true, servedRelease: err.datasetReleaseId ?? null }
    throw err
  }
}

function isMissing(value: unknown): value is Missing {
  return Boolean(value && typeof value === 'object' && (value as Missing).missing === true)
}

/** A page, the alias target when the URL is a `.so` stub, or a miss. */
export async function lookupManPage(opts: {
  name: string
  section: string
  distro: Distro
  pkg?: string
  release?: string
}): Promise<ManPageLookup> {
  const { name, section, pkg, release } = opts
  const relatedFor = (distro: Distro): Promise<RelatedResponse> =>
    fetchRelated({ distro, name, section, ...(release ? { release } : {}) }).catch((err: unknown) => ({
      items: [],
      ...(err instanceof FastApiError && err.datasetReleaseId ? { datasetReleaseId: err.datasetReleaseId } : {}),
    }))
  // Related reads run beside the document, for the requested distro; a fallback to Debian reads them again.
  const related = pkg ? null : relatedFor(opts.distro)
  const found = await orMissing(
    withDistroFallback(opts.distro, (distro) =>
      fetchManByNameAndSectionOrAlias({ distro, name, section, ...(pkg ? { pkg } : {}), ...(release ? { release } : {}) }),
    ),
  )
  if (isMissing(found)) return { kind: 'miss', servedRelease: found.servedRelease }
  if (found.data.kind === 'alias') return { ...found.data, distro: found.distro, servedRelease: servedRelease(found.data) }
  const relatedResult = await (found.distro === opts.distro && related ? related : relatedFor(found.distro))
  const pageRelease = servedRelease(found.data)
  // The page is one answer only when its related links come from the same release; otherwise
  // it names no single release, so the route does not share it under any key.
  const consistent = pageRelease !== null && servedRelease(relatedResult) === pageRelease
  return { kind: 'page', distro: found.distro, data: found.data.data, related: relatedResult.items, servedRelease: consistent ? pageRelease : null }
}

export type ResolvedManName = ({ distro: Distro; result: ManResolveResult } | { result: null }) & Served

/** A name's only section, alias target or section picker; `result: null` for a miss. */
export async function resolveManName(name: string, distro: Distro, release?: string): Promise<ResolvedManName> {
  const resolved = await orMissing(
    withDistroFallback(distro, (activeDistro) =>
      fetchManResolve({ distro: activeDistro, name: name.toLowerCase(), ...(release ? { release } : {}) }),
    ),
  )
  if (isMissing(resolved)) return { result: null, servedRelease: resolved.servedRelease }
  return { distro: resolved.distro, result: resolved.data, servedRelease: servedRelease(resolved.data) }
}

export type ManMiss = {
  name: string
  section: string | null
  /** The distro the page is missing from. */
  distro: Distro
  urlDistro: Distro | null
  suggestions: Suggestion[]
  /** Distros that have the page, or the name in any section. */
  distros: Distro[]
  /** True when the typo reads were skipped for the search rate limit: the response must not be shared. */
  limited: boolean
  /** False when a suggestion or distro read came from another release than the key's: do not share it. */
  answeredByKey: boolean
}

/** What a miss offers: nearby names and the distros that have the page. */
export async function manMiss(opts: {
  name: string
  section: string | null
  distro: Distro
  urlDistro: Distro | null
  headers: Headers
  release?: string
}): Promise<ManMiss> {
  const { name, section, distro, urlDistro, release } = opts
  const miss: ManMiss = { name, section, distro, urlDistro, suggestions: [], distros: [], limited: false, answeredByKey: true }
  if (!isManName(name)) return miss
  // The typo read costs up to 64 documents, so it shares the search limit.
  if (await isRateLimited(opts.headers, 'search')) return { ...miss, limited: true }
  const lower = name.toLowerCase()
  const [suggested, available] = await Promise.all([
    withDistroFallback(distro, (activeDistro) =>
      suggest({ distro: activeDistro, name: lower, typos: true, ...(release ? { release } : {}) }),
    ).catch(() => null),
    fetchManDistros({ name: lower, section, ...(release ? { release } : {}) }).catch(() => null),
  ])
  // A failed read adds nothing to the page, so only a read that answered from another release counts against it.
  const answeredByKey = (!suggested || answeredBy(suggested.data, release)) && (!available || answeredBy(available, release))
  return { ...miss, suggestions: suggested?.data.suggestions ?? [], distros: available?.distros ?? [], answeredByKey }
}
