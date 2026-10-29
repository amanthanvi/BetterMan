import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { cache } from 'react'

import {
  FastApiError,
  fetchManByNameAndSectionOrAlias,
  fetchManDistros,
  fetchManMetaByNameAndSection,
  fetchManResolve,
  suggest,
  withDistroFallback,
  type ManAlias,
  type ManResolveResult,
  type Suggestion,
} from './api'
import type { Distro } from './distro'
import type { ManPage } from './docModel'
import { isRateLimited } from './rateLimit'
import { explicitDistro, resolveRequestDistro, type SearchParams } from './requestContext'
import { isManName } from './shortUrl'

export type LocatedManPage = { distro: Distro; data: { kind: 'page'; page: ManPage } | ManAlias }
export type ResolvedManName = { distro: Distro; result: ManResolveResult }

/** What generateMetadata answers for a miss, before the page calls notFound(). Next adds noindex to every 404. */
export const MISSING_MAN_METADATA: Metadata = { title: 'Not found — BetterMan' }

async function orMissing<T>(lookup: Promise<T>): Promise<T | null> {
  try {
    return await lookup
  } catch (err) {
    if (err instanceof FastApiError && err.status === 404) return null
    throw err
  }
}

// These settle the status code before anything streams, and return null for a
// miss instead of calling notFound(): thrown from generateMetadata, notFound()
// answers an empty error shell. cache() shares one lookup per request between
// generateMetadata, the page and the not-found boundary.

/** Page metadata proves a page exists; a `.so` stub, which has none, loads its alias target. */
export const locateManPage = cache(
  async (name: string, section: string, requestedDistro: Distro, pkg?: string): Promise<LocatedManPage | null> =>
    await orMissing(
      withDistroFallback(requestedDistro, async (distro): Promise<LocatedManPage['data']> => {
        const opts = { distro, name, section, ...(pkg ? { pkg } : {}) }
        if (pkg || name !== name.toLowerCase()) {
          const provider = await fetchManByNameAndSectionOrAlias(opts)
          return provider.kind === 'alias' ? provider : { kind: 'page', page: provider.data.page }
        }
        try {
          return { kind: 'page', page: (await fetchManMetaByNameAndSection(opts)).page }
        } catch (err) {
          if (!(err instanceof FastApiError) || err.code !== 'PAGE_NOT_FOUND') throw err
        }
        const result = await fetchManByNameAndSectionOrAlias(opts)
        return result.kind === 'alias' ? result : { kind: 'page', page: result.data.page }
      }),
    ),
)

export const resolveManName = cache(async (name: string, requestedDistro: Distro): Promise<ResolvedManName | null> => {
  const resolved = await orMissing(
    withDistroFallback(requestedDistro, (distro) => fetchManResolve({ distro, name: name.toLowerCase() })),
  )
  return resolved && { distro: resolved.distro, result: resolved.data }
})

export type ManMiss = {
  name: string
  section: string | null
  /** The distro the page is missing from. */
  distro: Distro
  urlDistro: Distro | null
  suggestions: Suggestion[]
  /** Distros that have the page, or the name in any section. */
  distros: Distro[]
}

/**
 * The man page this request missed, or null when it exists. The `/man/[name]`
 * not-found boundary renders on every request, as the client router's
 * fallback, without params, so this reads the path the proxy forwards and
 * reuses the page's cached lookup: a page view costs no extra read.
 */
export async function requestedManMiss(): Promise<ManMiss | null> {
  const requestHeaders = await headers()
  const path = requestHeaders.get('x-bm-path')
  if (!path) return null
  const url = new URL(path, 'https://path.invalid')
  const [root, rawName, rawSection, ...rest] = url.pathname.split('/').slice(1)
  if (root !== 'man' || !rawName || rest.length) return null

  let name: string
  let section: string | null
  try {
    name = decodeURIComponent(rawName)
    section = rawSection === undefined ? null : decodeURIComponent(rawSection)
  } catch {
    return null
  }

  const sp: SearchParams = { distro: url.searchParams.get('distro') ?? undefined }
  const distro = await resolveRequestDistro(sp)
  const found = section === null ? await resolveManName(name, distro) : await locateManPage(name, section, distro)
  if (found) return null

  const miss: ManMiss = { name, section, distro, urlDistro: explicitDistro(sp), suggestions: [], distros: [] }
  // The typo read costs up to 64 documents, so it shares the search limit.
  if (!isManName(name) || (await isRateLimited(requestHeaders, 'search'))) return miss
  const lower = name.toLowerCase()
  const [suggested, available] = await Promise.all([
    withDistroFallback(distro, (activeDistro) => suggest({ distro: activeDistro, name: lower, typos: true })).catch(
      () => null,
    ),
    fetchManDistros({ name: lower, section }).catch(() => null),
  ])
  return { ...miss, suggestions: suggested?.data.suggestions ?? [], distros: available?.distros ?? [] }
}
