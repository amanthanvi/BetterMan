import { api } from '../../convex/_generated/api'
import { unstable_cache } from 'next/cache'
import type { Distro } from './distro'
import type { AmbiguousPageResponse, ManPage, ManPageResponse } from './docModel'
import { getConvexClient } from './convexClient'
const PUBLIC_REVALIDATE_SECONDS = 60 * 60
const SEARCH_REVALIDATE_SECONDS = 5 * 60
const SITEMAP_CHUNK_ITEMS = 5000
const MAX_SITEMAP_CHUNKS = 10

export type InfoResponse = {
  datasetReleaseId: string
  distro: string
  locale: string
  pageCount: number
  lastUpdated: string
}

export type SectionLabel = { section: string; label: string }

export type SearchResult = {
  name: string
  section: string
  title: string
  description: string
  highlights: string[]
}

export type SearchResponse = {
  query: string
  results: SearchResult[]
  suggestions: string[]
  hasMore: boolean
  nextOffset?: number | null
}

export type SectionPage = { name: string; section: string; title: string; description: string }

export type SectionResponse = {
  section: string
  label: string
  total: number
  limit: number
  offset: number
  results: SectionPage[]
}

export type Suggestion = { name: string; section: string; description: string }

export type SuggestResponse = { query: string; suggestions: Suggestion[] }

export type LicensePackage = { name: string; version: string; hasLicenseText: boolean }

export type LicensesResponse = {
  datasetReleaseId: string
  imageRef: string
  imageDigest: string
  ingestedAt: string
  packageManifest: Record<string, unknown> | null
  packages: LicensePackage[]
}

export type LicenseTextResponse = { package: string; licenseId: string; licenseName: string; text: string }

export class FastApiError extends Error {
  status: number
  code: string
  bodyText?: string

  constructor(status: number, code: string, message: string, bodyText?: string) {
    super(message)
    this.name = 'FastApiError'
    this.status = status
    this.code = code
    this.bodyText = bodyText
  }
}

function apiError(status: number, code: string, message: string): FastApiError {
  return new FastApiError(status, code, message, JSON.stringify({ error: { code, message } }))
}

export function isReleaseNotFoundError(err: unknown): err is FastApiError {
  return err instanceof FastApiError && err.code === 'RELEASE_NOT_FOUND'
}

export async function withDistroFallback<T>(
  distro: Distro,
  fn: (distro: Distro) => Promise<T>,
): Promise<{ distro: Distro; data: T }> {
  try {
    return { distro, data: await fn(distro) }
  } catch (err) {
    if (distro !== 'debian' && isReleaseNotFoundError(err)) {
      return { distro: 'debian', data: await fn('debian') }
    }
    throw err
  }
}

function isMissingActiveReleaseError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('ACTIVE_RELEASE_NOT_FOUND')
}

async function mapConvexError<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (isMissingActiveReleaseError(err)) {
      throw apiError(404, 'RELEASE_NOT_FOUND', 'Dataset release not found')
    }
    throw err
  }
}

function convex() {
  try {
    return getConvexClient()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Convex is not configured'
    throw apiError(503, 'CONVEX_NOT_CONFIGURED', message)
  }
}

const cachedInfo = unstable_cache(
  async (distro: Distro) => await convex().query(api.queries.getInfo, { distro }),
  ['betterman', 'convex', 'info'],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
)

const cachedSections = unstable_cache(
  async (distro: Distro) => await convex().query(api.queries.listSections, { distro }),
  ['betterman', 'convex', 'sections'],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
)

const cachedSearch = unstable_cache(
  async (
    distro: Distro,
    q: string,
    section: string | null,
    limit: number,
    offset: number,
  ) =>
    await convex().query(api.queries.search, {
      distro,
      q,
      section,
      limit,
      offset,
    }),
  ['betterman', 'convex', 'search'],
  { revalidate: SEARCH_REVALIDATE_SECONDS },
)

const cachedSection = unstable_cache(
  async (
    distro: Distro,
    section: string,
    limit: number,
    offset: number,
  ) =>
    await convex().query(api.queries.listSection, {
      distro,
      section,
      limit,
      offset,
    }),
  ['betterman', 'convex', 'section'],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
)

const cachedManByName = unstable_cache(
  async (distro: Distro, name: string) =>
    await convex().action(api.content.getManByName, { distro, name }),
  ['betterman', 'convex', 'man-by-name', 'v2'],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
)

const cachedManByNameAndSection = unstable_cache(
  async (distro: Distro, name: string, section: string) =>
    await convex().action(api.content.getManByNameAndSection, { distro, name, section }),
  ['betterman', 'convex', 'man-by-name-and-section', 'v2'],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
)

const cachedManMetaByNameAndSection = unstable_cache(
  async (distro: Distro, name: string, section: string) =>
    await convex().query(api.queries.getManMetaByNameAndSection, { distro, name, section }),
  ['betterman', 'convex', 'man-meta-by-name-and-section'],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
)

const cachedRelated = unstable_cache(
  async (distro: Distro, name: string, section: string) =>
    await convex().query(api.queries.getRelated, { distro, name, section }),
  ['betterman', 'convex', 'related'],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
)

const cachedSuggest = unstable_cache(
  async (distro: Distro, name: string) =>
    await convex().query(api.queries.suggest, { distro, name }),
  ['betterman', 'convex', 'suggest'],
  { revalidate: SEARCH_REVALIDATE_SECONDS },
)

const cachedLicenses = unstable_cache(
  async (distro: Distro) => await convex().query(api.queries.listLicenses, { distro }),
  ['betterman', 'convex', 'licenses'],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
)

const cachedLicenseText = unstable_cache(
  async (distro: Distro, packageName: string) =>
    await convex().query(api.queries.getLicense, { distro, packageName }),
  ['betterman', 'convex', 'license-text'],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
)

const cachedSeoReleases = unstable_cache(
  async () => await convex().query(api.queries.listSeoReleases, {}),
  ['betterman', 'convex', 'seo-releases'],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
)

export async function fetchInfo(distro: Distro): Promise<InfoResponse> {
  return await mapConvexError(() => cachedInfo(distro))
}

export async function listSections(distro: Distro): Promise<SectionLabel[]> {
  return await mapConvexError(() => cachedSections(distro))
}

export async function search(opts: {
  distro: Distro
  q: string
  section?: string
  limit?: number
  offset?: number
}): Promise<SearchResponse> {
  return await mapConvexError(() =>
    cachedSearch(
      opts.distro,
      opts.q,
      opts.section ?? null,
      opts.limit ?? 20,
      opts.offset ?? 0,
    ),
  )
}

export async function listSection(opts: {
  distro: Distro
  section: string
  limit?: number
  offset?: number
}): Promise<SectionResponse> {
  const result = await mapConvexError(() =>
    cachedSection(
      opts.distro,
      opts.section,
      opts.limit ?? 200,
      opts.offset ?? 0,
    ),
  )
  if (!result) throw apiError(404, 'SECTION_NOT_FOUND', 'Section not found')
  return result
}

export type ManAlias = { kind: 'alias'; name: string; section: string }

export type ManByNameResult =
  | { kind: 'page'; data: ManPageResponse }
  | { kind: 'ambiguous'; options: AmbiguousPageResponse['options'] }
  | ManAlias

type ConvexManByNameResult =
  | { kind: 'not_found' }
  | { kind: 'page'; data: ManPageResponse }
  | { kind: 'ambiguous'; options: AmbiguousPageResponse['options'] }
  | ManAlias

type ConvexManByNameAndSectionResult = { kind: 'page'; data: ManPageResponse } | ManAlias | null

export async function fetchManByName(opts: {
  distro: Distro
  name: string
}): Promise<ManByNameResult> {
  const result = (await mapConvexError(() =>
    cachedManByName(
      opts.distro,
      opts.name,
    ),
  )) as ConvexManByNameResult

  if (result.kind === 'not_found') {
    throw apiError(404, 'PAGE_NOT_FOUND', 'Page not found')
  }
  if (result.kind === 'ambiguous') {
    return { kind: 'ambiguous', options: result.options as AmbiguousPageResponse['options'] }
  }
  if (result.kind === 'alias') {
    return { kind: 'alias', name: result.name, section: result.section }
  }
  return { kind: 'page', data: result.data as ManPageResponse }
}

export type ManByNameAndSectionResult = { kind: 'page'; data: ManPageResponse } | ManAlias

/** Resolves a page, or reports the alias target when the URL is a `.so` stub. */
export async function fetchManByNameAndSectionOrAlias(opts: {
  distro: Distro
  name: string
  section: string
}): Promise<ManByNameAndSectionResult> {
  const result = (await mapConvexError(() =>
    cachedManByNameAndSection(opts.distro, opts.name, opts.section),
  )) as ConvexManByNameAndSectionResult
  if (!result) throw apiError(404, 'PAGE_NOT_FOUND', 'Page not found')
  return result
}

export async function fetchManByNameAndSection(opts: {
  distro: Distro
  name: string
  section: string
}): Promise<ManPageResponse> {
  const result = await fetchManByNameAndSectionOrAlias(opts)
  if (result.kind === 'alias') throw apiError(404, 'PAGE_NOT_FOUND', 'Page not found')
  return result.data
}

export type RelatedResponse = { items: SectionPage[] }

export type ManPageMetaResponse = { page: ManPage }

export async function fetchRelated(opts: {
  distro: Distro
  name: string
  section: string
}): Promise<RelatedResponse> {
  const result = await mapConvexError(() => cachedRelated(opts.distro, opts.name, opts.section))
  if (!result) throw apiError(404, 'PAGE_NOT_FOUND', 'Page not found')
  return result as RelatedResponse
}

export async function fetchManMetaByNameAndSection(opts: {
  distro: Distro
  name: string
  section: string
}): Promise<ManPageMetaResponse> {
  const result = (await mapConvexError(() =>
    cachedManMetaByNameAndSection(opts.distro, opts.name, opts.section),
  )) as ManPageMetaResponse | null
  if (!result) throw apiError(404, 'PAGE_NOT_FOUND', 'Page not found')
  return result
}

export async function suggest(opts: { distro: Distro; name: string }): Promise<SuggestResponse> {
  return await mapConvexError(() => cachedSuggest(opts.distro, opts.name))
}

export async function fetchLicenses(opts: { distro: Distro }): Promise<LicensesResponse> {
  return (await mapConvexError(() => cachedLicenses(opts.distro))) as LicensesResponse
}

export async function fetchLicenseText(opts: { distro: Distro; packageName: string }): Promise<LicenseTextResponse> {
  const result = await mapConvexError(() => cachedLicenseText(opts.distro, opts.packageName))
  if (!result) throw apiError(404, 'LICENSE_NOT_FOUND', 'License not found')
  return result as LicenseTextResponse
}

export type SeoRelease = {
  distro: string
  datasetReleaseId: string
  ingestedAt: string
  pageCount: number
}

export type SeoReleasesResponse = {
  urlsPerFile: number
  items: SeoRelease[]
}

export type SeoSitemapItem = {
  name: string
  section: string
}

export type SeoSitemapPageResponse = {
  items: SeoSitemapItem[]
  page: number
}

type SeoSitemapPageChunkResponse = {
  items: SeoSitemapItem[]
  page: number
  isDone: boolean
  continueCursor: string
} | null

export async function fetchSeoReleases(): Promise<SeoReleasesResponse> {
  return await cachedSeoReleases()
}

export async function fetchSeoSitemapPage(opts: { distro: string; page: number }): Promise<SeoSitemapPageResponse> {
  const items: SeoSitemapItem[] = []
  let cursor: string | null = null

  for (let chunk = 0; chunk < MAX_SITEMAP_CHUNKS; chunk += 1) {
    const result: SeoSitemapPageChunkResponse = await convex().query(api.queries.listSitemapPageChunk, {
      distro: opts.distro as Distro,
      page: opts.page,
      paginationOpts: { numItems: SITEMAP_CHUNK_ITEMS, cursor },
    })
    if (!result) throw apiError(404, 'SITEMAP_PAGE_NOT_FOUND', 'Sitemap page not found')
    items.push(...result.items)
    if (result.isDone) return { items, page: opts.page }
    cursor = result.continueCursor
  }

  throw apiError(503, 'SITEMAP_PAGE_TOO_LARGE', 'Sitemap page is too large')
}
