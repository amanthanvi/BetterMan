import { packageName } from './packageName'
import { api } from '../../convex/_generated/api'
import { unstable_cache } from 'next/cache'
import type { FunctionReturnType } from 'convex/server'
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
  /** Set when the page's OPTIONS defined the queried flag; anchorId is the option row. */
  symbolKind?: 'environment' | 'files' | 'errors' | 'config' | 'subcommand' | 'shell'
  match?: 'option'
  anchorId?: string
}

export type SearchResponse = {
  query: string
  results: SearchResult[]
  suggestions: string[]
  correctedQuery?: string
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
  hasMore: boolean
  nextCursor: string | null
  prevCursor: string | null
  results: SectionPage[]
}

export type Suggestion = { name: string; section: string; description: string }

export type SuggestResponse = { query: string; suggestions: Suggestion[] }

/** `distro` is where the suggestions came from: Debian when the requested distro has no active release. */
export type SuggestApiResponse = SuggestResponse & { distro: Distro }

export type LicensePackage = { name: string; version: string; hasLicenseText: boolean }

export type LicensesResponse = {
  datasetReleaseId: string
  imageRef: string
  imageDigest: string
  ingestedAt: string
  packageManifest: Record<string, unknown> | null
  packageManifestUrl?: string | null
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

// Next's data cache rejects entries above 2 MiB; return large manuals once without a retry.
class UncacheableManPage extends Error {
  constructor(readonly value: unknown) { super('Man page exceeds the shared data-cache entry limit') }
}
function cacheableManPage<T>(value: T): T {
  if (new TextEncoder().encode(JSON.stringify(value)).length > 1_900_000) throw new UncacheableManPage(value)
  return value
}

async function mapConvexError<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof UncacheableManPage) return err.value as T
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
    cursor: string | null,
    before: string | null,
  ) =>
    await convex().query(api.queries.listSection, {
      distro,
      section,
      limit,
      offset,
      ...(cursor === null ? {} : { cursor }),
      ...(before === null ? {} : { before }),
    }),
  ['betterman', 'convex', 'section', 'v2'],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
)

const cachedManByName = unstable_cache(
  async (distro: Distro, name: string) =>
    cacheableManPage(await convex().action(api.content.getManByName, { distro, name })),
  ['betterman', 'convex', 'man-by-name', 'v3'],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
)

const cachedResolveManByName = unstable_cache(
  async (distro: Distro, name: string) =>
    await convex().query(api.queries.resolveManByName, { distro, name }),
  ['betterman', 'convex', 'resolve-man-by-name'],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
)

const cachedManByNameAndSection = unstable_cache(
  async (distro: Distro, name: string, section: string, pkg: string | null) =>
    cacheableManPage(await convex().action(api.content.getManByNameAndSection, { distro, name, section, ...(pkg ? { pkg } : {}) })),
  ['betterman', 'convex', 'man-by-name-and-section', 'v4'],
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
  ['betterman', 'convex', 'related', 'v2'],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
)

const cachedManDistros = unstable_cache(
  async (name: string, section: string | null) =>
    await convex().query(api.queries.listManDistros, section === null ? { name } : { name, section }),
  ['betterman', 'convex', 'man-distros'],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
)

const cachedSuggest = unstable_cache(
  async (distro: Distro, name: string, typos: boolean) =>
    await convex().query(api.queries.suggest, typos ? { distro, name, typos } : { distro, name }),
  ['betterman', 'convex', 'suggest'],
  { revalidate: SEARCH_REVALIDATE_SECONDS },
)

const cachedLicensePage = unstable_cache(
  async (distro: Distro, cursor: string | null, datasetReleaseId: string | null) =>
    await convex().query(api.queries.listLicenses, {
      distro, ...(cursor === null ? {} : { cursor }),
      ...(datasetReleaseId === null ? {} : { datasetReleaseId }),
    }),
  ['betterman', 'convex', 'license-packages', 'v2'],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
)

// Cache bounded pages, not a joined 17k-package response (>Next's 2 MiB entry
// limit). The license surface can join them without repeating backend reads.
async function cachedLicenses(distro: Distro) {
  // A promotion between package pages invalidates the pinned generation. Read
  // page one uncached on retry rather than joining stale cached generations.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await licensesForRelease(distro, attempt > 0)
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('RELEASE_CHANGED')) throw error
    }
  }
  throw new FastApiError(503, 'RELEASE_CHANGED', 'Dataset changed during pagination; retry shortly')
}

async function licensesForRelease(distro: Distro, fresh: boolean) {
  const first = fresh
    ? await convex().query(api.queries.listLicenses, { distro })
    : await cachedLicensePage(distro, null, null)
  const packages = [...first.packages]
  let cursor = first.nextCursor
  while (cursor) {
    const page = await cachedLicensePage(distro, cursor, first.datasetReleaseId)
    packages.push(...page.packages)
    if (page.nextCursor === cursor) throw new Error('License pagination did not advance')
    cursor = page.nextCursor
  }
  let packageManifest = first.packageManifest
  if (first.packageManifestUrl && (first.packageManifestBytes ?? 0) <= 64 * 1024) {
    const response = await fetch(first.packageManifestUrl)
    if (!response.ok) throw new Error('Failed to load package manifest')
    packageManifest = await response.json()
  }
  return { ...first, packageManifest, packages }
}

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
  cursor?: string
  before?: string
}): Promise<SectionResponse> {
  const result = await mapConvexError(() =>
    cachedSection(
      opts.distro,
      opts.section,
      opts.limit ?? 200,
      opts.offset ?? 0,
      opts.cursor ?? null,
      opts.before ?? null,
    ),
  )
  if (!result) throw apiError(404, 'SECTION_NOT_FOUND', 'Section not found')
  return result
}

export type ManAlias = { kind: 'alias'; name: string; section: string; pkg?: string }

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
    return { kind: 'alias', name: result.name, section: result.section, ...(result.pkg ? { pkg: result.pkg } : {}) }
  }
  return { kind: 'page', data: result.data as ManPageResponse }
}

export type ManResolveResult = Exclude<FunctionReturnType<typeof api.queries.resolveManByName>, { kind: 'not_found' }>

/** Resolves a name-only URL from page metadata, without loading the document. */
export async function fetchManResolve(opts: { distro: Distro; name: string }): Promise<ManResolveResult> {
  const result = await mapConvexError(() => cachedResolveManByName(opts.distro, opts.name))
  if (result.kind === 'not_found') throw apiError(404, 'PAGE_NOT_FOUND', 'Page not found')
  return result
}

export type ManByNameAndSectionResult = { kind: 'page'; data: ManPageResponse } | ManAlias

/** Resolves a page, or reports the alias target when the URL is a `.so` stub. */
export async function fetchManByNameAndSectionOrAlias(opts: {
  distro: Distro
  name: string
  section: string
  pkg?: string
}): Promise<ManByNameAndSectionResult> {
  const result = (await mapConvexError(() =>
    cachedManByNameAndSection(opts.distro, opts.name, opts.section, packageName(opts.pkg) ?? null),
  )) as ConvexManByNameAndSectionResult
  if (!result) throw apiError(404, 'PAGE_NOT_FOUND', 'Page not found')
  return result
}

export type RelatedResponse = { items: SectionPage[] }

export type ManPageMetaResponse = { page: ManPage }

export type ManDistrosResponse = { distros: Distro[] }

/** Without a section, a distro counts when it has the name in any section. */
export async function fetchManDistros(opts: { name: string; section: string | null }): Promise<ManDistrosResponse> {
  return await cachedManDistros(opts.name, opts.section)
}

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
  pkg?: string
}): Promise<ManPageMetaResponse> {
  if (packageName(opts.pkg) || opts.name !== opts.name.toLowerCase()) {
    const provider = await fetchManByNameAndSectionOrAlias(opts)
    if (provider.kind !== 'page') throw apiError(404, 'PAGE_NOT_FOUND', 'Page not found')
    return { page: provider.data.page }
  }
  const result = (await mapConvexError(() =>
    cachedManMetaByNameAndSection(opts.distro, opts.name, opts.section),
  )) as ManPageMetaResponse | null
  if (!result) throw apiError(404, 'PAGE_NOT_FOUND', 'Page not found')
  return result
}

/** `typos` adds bounded spelling corrections when no name has the prefix. */
export async function suggest(opts: { distro: Distro; name: string; typos?: boolean }): Promise<SuggestResponse> {
  return await mapConvexError(() => cachedSuggest(opts.distro, opts.name, opts.typos === true))
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
  datasetReleaseId: string
  items: SeoSitemapItem[]
  page: number
}

type SeoSitemapPageChunkResponse = {
  datasetReleaseId: string
  items: SeoSitemapItem[]
  page: number
  isDone: boolean
  continueCursor: string
} | null

export async function fetchSeoReleases(): Promise<SeoReleasesResponse> {
  return await cachedSeoReleases()
}

async function loadSeoSitemapPage(distro: string, page: number): Promise<SeoSitemapPageResponse> {
  const items: SeoSitemapItem[] = []
    let cursor: string | null = null

  for (let chunk = 0; chunk < MAX_SITEMAP_CHUNKS; chunk += 1) {
    const result: SeoSitemapPageChunkResponse = await convex().query(api.queries.listSitemapPageChunk, {
      distro: distro as Distro,
      page,
      paginationOpts: { numItems: SITEMAP_CHUNK_ITEMS, cursor },
    })
    if (!result) throw apiError(404, 'SITEMAP_PAGE_NOT_FOUND', 'Sitemap page not found')
    items.push(...result.items)
    if (result.isDone) return { datasetReleaseId: result.datasetReleaseId, items, page }
    cursor = result.continueCursor
  }

  throw apiError(503, 'SITEMAP_PAGE_TOO_LARGE', 'Sitemap page is too large')
}

class SitemapReleaseMismatch extends Error {
  data: SeoSitemapPageResponse

  constructor(data: SeoSitemapPageResponse) {
    super('Sitemap page read a different release')
    this.data = data
  }
}

// Keyed by the prod release listed in fetchSeoReleases, which can lag a switch or a prune by up
// to an hour. Throwing keeps another release's URLs out of this key; unstable_cache stores no errors.
const cachedSeoSitemapPage = unstable_cache(
  async (distro: string, datasetReleaseId: string, page: number): Promise<SeoSitemapPageResponse> => {
    const data = await loadSeoSitemapPage(distro, page)
    if (data.datasetReleaseId !== datasetReleaseId) throw new SitemapReleaseMismatch(data)
    return data
  },
  ['betterman', 'convex', 'seo-sitemap-page'],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
)

export async function fetchSeoSitemapPage(opts: { distro: string; page: number }): Promise<SeoSitemapPageResponse> {
  const release = (await fetchSeoReleases()).items.find((item) => item.distro === opts.distro)
  if (!release) throw apiError(404, 'SITEMAP_PAGE_NOT_FOUND', 'Sitemap page not found')
  try {
    return await cachedSeoSitemapPage(opts.distro, release.datasetReleaseId, opts.page)
  } catch (err) {
    if (err instanceof SitemapReleaseMismatch) return err.data
    throw err
  }
}

const cachedPackage = unstable_cache(
  async (distro: Distro, name: string, cursor: string | null) =>
    await convex().query(api.packages.getPackage, { distro, name, paginationOpts: { numItems: 100, cursor } }),
  ['betterman', 'convex', 'package', 'v3'],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
)

export async function fetchPackage(opts: { distro: Distro; name: string; cursor?: string }) {
  return await mapConvexError(() => cachedPackage(opts.distro, opts.name, opts.cursor ?? null))
}

export async function fetchPortability(opts: { distro: Distro; name: string; section: string; offset: number }) {
  return await mapConvexError(() => convex().query(api.portability.getDetails, opts))
}
