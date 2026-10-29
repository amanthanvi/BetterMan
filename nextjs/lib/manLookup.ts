import {
  FastApiError,
  fetchManByNameAndSectionOrAlias,
  fetchManDistros,
  fetchManResolve,
  fetchRelated,
  suggest,
  withDistroFallback,
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

export type ManPageLookup =
  | { kind: 'page'; distro: Distro; data: ManPageResponse; related: RelatedResponse['items'] }
  | ({ distro: Distro } & ManAlias)

async function orMissing<T>(lookup: Promise<T>): Promise<T | null> {
  try {
    return await lookup
  } catch (err) {
    if (err instanceof FastApiError && err.status === 404) return null
    throw err
  }
}

/** A page, or the alias target when the URL is a `.so` stub; null for a miss. */
export async function lookupManPage(opts: {
  name: string
  section: string
  distro: Distro
  pkg?: string
  release?: string
}): Promise<ManPageLookup | null> {
  const { name, section, pkg, release } = opts
  const relatedFor = (distro: Distro) => fetchRelated({ distro, name, section, ...(release ? { release } : {}) }).catch(() => ({ items: [] }))
  // Related reads run beside the document, for the requested distro; a fallback to Debian reads them again.
  const related = relatedFor(opts.distro)
  const found = await orMissing(
    withDistroFallback(opts.distro, (distro) =>
      fetchManByNameAndSectionOrAlias({ distro, name, section, ...(pkg ? { pkg } : {}), ...(release ? { release } : {}) }),
    ),
  )
  if (!found) return null
  if (found.data.kind === 'alias') return { ...found.data, distro: found.distro }
  const relatedItems = (await (found.distro === opts.distro ? related : relatedFor(found.distro))).items
  return { kind: 'page', distro: found.distro, data: found.data.data, related: relatedItems }
}

export type ResolvedManName = { distro: Distro; result: ManResolveResult }

export async function resolveManName(name: string, distro: Distro, release?: string): Promise<ResolvedManName | null> {
  const resolved = await orMissing(
    withDistroFallback(distro, (activeDistro) =>
      fetchManResolve({ distro: activeDistro, name: name.toLowerCase(), ...(release ? { release } : {}) }),
    ),
  )
  return resolved && { distro: resolved.distro, result: resolved.data }
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
  const miss: ManMiss = { name, section, distro, urlDistro, suggestions: [], distros: [], limited: false }
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
  return { ...miss, suggestions: suggested?.data.suggestions ?? [], distros: available?.distros ?? [] }
}
