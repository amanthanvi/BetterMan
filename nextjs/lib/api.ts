import { api } from '../../convex/_generated/api'
import { unstable_cache } from 'next/cache'
import type { Distro } from './distro'
import type {
  AmbiguousPageResponse,
  ManPageResponse,
} from './docModel'
import { getConvexClient, getDatasetStage } from './convexClient'
import type { components } from './openapi.gen'

type Schemas = components['schemas']
const PUBLIC_REVALIDATE_SECONDS = 60 * 60
const SEARCH_REVALIDATE_SECONDS = 5 * 60
const SITEMAP_CHUNK_ITEMS = 5000
const MAX_SITEMAP_CHUNKS = 10

export type InfoResponse = Schemas['InfoResponse']

export type SectionLabel = Schemas['SectionLabel']

export type SearchResult = Schemas['SearchResult']

export type SearchResponse = Schemas['SearchResponse']

export type SectionPage = Schemas['SectionPage']

export type SectionResponse = Schemas['SectionResponse']

export type Suggestion = Schemas['Suggestion']

export type SuggestResponse = Schemas['SuggestResponse']

export type LicensePackage = Schemas['LicensePackage']

export type LicensesResponse = Schemas['LicensesResponse']

export type LicenseTextResponse = Schemas['LicenseTextResponse']

export class FastApiError extends Error {
  status: number
  bodyText?: string

  constructor(status: number, message: string, bodyText?: string) {
    super(message)
    this.name = 'FastApiError'
    this.status = status
    this.bodyText = bodyText
  }
}

function apiError(status: number, code: string, message: string): FastApiError {
  return new FastApiError(status, message, JSON.stringify({ error: { code, message } }))
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
  async (stage: ReturnType<typeof getDatasetStage>, distro: Distro) =>
    await convex().query(api.queries.getInfo, { stage, distro }),
  ['betterman', 'convex', 'info'],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
)

const cachedSections = unstable_cache(
  async (stage: ReturnType<typeof getDatasetStage>, distro: Distro) =>
    await convex().query(api.queries.listSections, { stage, distro }),
  ['betterman', 'convex', 'sections'],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
)

const cachedSearch = unstable_cache(
  async (
    stage: ReturnType<typeof getDatasetStage>,
    distro: Distro,
    q: string,
    section: string | null,
    limit: number,
    offset: number,
  ) =>
    await convex().query(api.queries.search, {
      stage,
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
    stage: ReturnType<typeof getDatasetStage>,
    distro: Distro,
    section: string,
    limit: number,
    offset: number,
  ) =>
    await convex().query(api.queries.listSection, {
      stage,
      distro,
      section,
      limit,
      offset,
    }),
  ['betterman', 'convex', 'section'],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
)

const cachedManByName = unstable_cache(
  async (stage: ReturnType<typeof getDatasetStage>, distro: Distro, name: string) =>
    await convex().action(api.content.getManByName, { stage, distro, name }),
  ['betterman', 'convex', 'man-by-name'],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
)

const cachedManByNameAndSection = unstable_cache(
  async (stage: ReturnType<typeof getDatasetStage>, distro: Distro, name: string, section: string) =>
    await convex().action(api.content.getManByNameAndSection, { stage, distro, name, section }),
  ['betterman', 'convex', 'man-by-name-and-section'],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
)

const cachedRelated = unstable_cache(
  async (stage: ReturnType<typeof getDatasetStage>, distro: Distro, name: string, section: string) =>
    await convex().query(api.queries.getRelated, { stage, distro, name, section }),
  ['betterman', 'convex', 'related'],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
)

const cachedSuggest = unstable_cache(
  async (stage: ReturnType<typeof getDatasetStage>, distro: Distro, name: string) =>
    await convex().query(api.queries.suggest, { stage, distro, name }),
  ['betterman', 'convex', 'suggest'],
  { revalidate: SEARCH_REVALIDATE_SECONDS },
)

const cachedLicenses = unstable_cache(
  async (stage: ReturnType<typeof getDatasetStage>, distro: Distro) =>
    await convex().query(api.queries.listLicenses, { stage, distro }),
  ['betterman', 'convex', 'licenses'],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
)

const cachedLicenseText = unstable_cache(
  async (stage: ReturnType<typeof getDatasetStage>, distro: Distro, packageName: string) =>
    await convex().query(api.queries.getLicense, { stage, distro, packageName }),
  ['betterman', 'convex', 'license-text'],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
)

const cachedSeoReleases = unstable_cache(
  async (stage: ReturnType<typeof getDatasetStage>) =>
    await convex().query(api.queries.listSeoReleases, { stage }),
  ['betterman', 'convex', 'seo-releases'],
  { revalidate: PUBLIC_REVALIDATE_SECONDS },
)

export async function fetchInfo(distro: Distro): Promise<InfoResponse> {
  return await mapConvexError(() => cachedInfo(getDatasetStage(), distro))
}

export async function listSections(distro: Distro): Promise<SectionLabel[]> {
  return await mapConvexError(() => cachedSections(getDatasetStage(), distro))
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
      getDatasetStage(),
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
      getDatasetStage(),
      opts.distro,
      opts.section,
      opts.limit ?? 200,
      opts.offset ?? 0,
    ),
  )
  if (!result) throw apiError(404, 'SECTION_NOT_FOUND', 'Section not found')
  return result
}

export type ManByNameResult =
  | { kind: 'page'; data: ManPageResponse }
  | { kind: 'ambiguous'; options: AmbiguousPageResponse['options'] }

type ConvexManByNameResult =
  | { kind: 'not_found' }
  | { kind: 'page'; data: ManPageResponse }
  | { kind: 'ambiguous'; options: AmbiguousPageResponse['options'] }

export async function fetchManByName(opts: {
  distro: Distro
  name: string
}): Promise<ManByNameResult> {
  const result = (await mapConvexError(() =>
    cachedManByName(
      getDatasetStage(),
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
  return { kind: 'page', data: result.data as ManPageResponse }
}

export async function fetchManByNameAndSection(opts: {
  distro: Distro
  name: string
  section: string
}): Promise<ManPageResponse> {
  const result = (await mapConvexError(() =>
    cachedManByNameAndSection(
      getDatasetStage(),
      opts.distro,
      opts.name,
      opts.section,
    ),
  )) as ManPageResponse | null
  if (!result) throw apiError(404, 'PAGE_NOT_FOUND', 'Page not found')
  return result
}

export type RelatedResponse = Schemas['RelatedResponse']

export async function fetchRelated(opts: {
  distro: Distro
  name: string
  section: string
}): Promise<RelatedResponse> {
  const result = await mapConvexError(() => cachedRelated(getDatasetStage(), opts.distro, opts.name, opts.section))
  if (!result) throw apiError(404, 'PAGE_NOT_FOUND', 'Page not found')
  return result as RelatedResponse
}

export async function suggest(opts: { distro: Distro; name: string }): Promise<SuggestResponse> {
  return await mapConvexError(() => cachedSuggest(getDatasetStage(), opts.distro, opts.name))
}

export async function fetchLicenses(opts: { distro: Distro }): Promise<LicensesResponse> {
  return (await mapConvexError(() => cachedLicenses(getDatasetStage(), opts.distro))) as LicensesResponse
}

export async function fetchLicenseText(opts: { distro: Distro; packageName: string }): Promise<LicenseTextResponse> {
  const result = await mapConvexError(() => cachedLicenseText(getDatasetStage(), opts.distro, opts.packageName))
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
  return await cachedSeoReleases(getDatasetStage())
}

export async function fetchSeoSitemapPage(opts: { distro: string; page: number }): Promise<SeoSitemapPageResponse> {
  const stage = getDatasetStage()
  const items: SeoSitemapItem[] = []
  let cursor: string | null = null

  for (let chunk = 0; chunk < MAX_SITEMAP_CHUNKS; chunk += 1) {
    const result: SeoSitemapPageChunkResponse = await convex().query(api.queries.listSitemapPageChunk, {
      stage,
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
