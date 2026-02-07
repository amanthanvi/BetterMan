import { fastapiUrl } from './fastapi'
import type { Distro } from './distro'
import type {
  AmbiguousPageResponse,
  ManPageResponse,
} from './docModel'

export type InfoResponse = {
  datasetReleaseId: string
  locale: string
  distro: string
  pageCount: number
  lastUpdated: string
}

export type SectionLabel = {
  section: string
  label: string
}

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
}

export type SectionPage = {
  name: string
  section: string
  title: string
  description: string
}

export type SectionResponse = {
  section: string
  label: string
  limit: number
  offset: number
  total: number
  results: SectionPage[]
}

export type Suggestion = {
  name: string
  section: string
  description: string
}

export type SuggestResponse = {
  query: string
  suggestions: Suggestion[]
}

export type LicensePackage = {
  name: string
  version: string
  hasLicenseText: boolean
}

export type LicensesResponse = {
  datasetReleaseId: string
  ingestedAt: string
  imageRef: string
  imageDigest: string
  packageManifest: Record<string, unknown> | null
  packages: LicensePackage[]
}

export type LicenseTextResponse = {
  package: string
  licenseId: string
  licenseName: string
  text: string
}

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

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(fastapiUrl(path), {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!res.ok) {
    let bodyText: string | undefined
    try {
      bodyText = await res.text()
    } catch {
      // ignore
    }
    throw new FastApiError(res.status, `FastAPI request failed: ${res.status} ${res.statusText}`, bodyText)
  }

  return (await res.json()) as T
}

export function fetchInfo(distro: Distro): Promise<InfoResponse> {
  const params = new URLSearchParams()
  if (distro !== 'debian') params.set('distro', distro)
  const qs = params.toString()
  return fetchJson<InfoResponse>(`/api/v1/info${qs ? `?${qs}` : ''}`, {
    next: { revalidate: 60 },
  })
}

export function listSections(distro: Distro): Promise<SectionLabel[]> {
  const params = new URLSearchParams()
  if (distro !== 'debian') params.set('distro', distro)
  const qs = params.toString()
  return fetchJson<SectionLabel[]>(`/api/v1/sections${qs ? `?${qs}` : ''}`, {
    next: { revalidate: 60 * 60 },
  })
}

export function search(opts: {
  distro: Distro
  q: string
  section?: string
  limit?: number
  offset?: number
}): Promise<SearchResponse> {
  const params = new URLSearchParams()
  params.set('q', opts.q)
  if (opts.section) params.set('section', opts.section)
  if (typeof opts.limit === 'number') params.set('limit', String(opts.limit))
  if (typeof opts.offset === 'number') params.set('offset', String(opts.offset))
  if (opts.distro !== 'debian') params.set('distro', opts.distro)
  return fetchJson<SearchResponse>(`/api/v1/search?${params.toString()}`, {
    cache: 'no-store',
  })
}

export function listSection(opts: {
  distro: Distro
  section: string
  limit?: number
  offset?: number
}): Promise<SectionResponse> {
  const params = new URLSearchParams()
  if (typeof opts.limit === 'number') params.set('limit', String(opts.limit))
  if (typeof opts.offset === 'number') params.set('offset', String(opts.offset))
  if (opts.distro !== 'debian') params.set('distro', opts.distro)
  const qs = params.toString()
  return fetchJson<SectionResponse>(
    `/api/v1/section/${encodeURIComponent(opts.section)}${qs ? `?${qs}` : ''}`,
    { next: { revalidate: 300 } },
  )
}

export type ManByNameResult =
  | { kind: 'page'; data: ManPageResponse }
  | { kind: 'ambiguous'; options: AmbiguousPageResponse['options'] }

export async function fetchManByName(opts: {
  distro: Distro
  name: string
}): Promise<ManByNameResult> {
  const params = new URLSearchParams()
  if (opts.distro !== 'debian') params.set('distro', opts.distro)
  const qs = params.toString()

  const res = await fetch(fastapiUrl(`/api/v1/man/${encodeURIComponent(opts.name)}${qs ? `?${qs}` : ''}`), {
    headers: { Accept: 'application/json' },
    next: { revalidate: 300 },
  })

  if (res.status === 409) {
    const payload = (await res.json()) as AmbiguousPageResponse
    return { kind: 'ambiguous', options: payload.options ?? [] }
  }

  if (!res.ok) {
    let bodyText: string | undefined
    try {
      bodyText = await res.text()
    } catch {
      // ignore
    }
    throw new FastApiError(res.status, `FastAPI request failed: ${res.status} ${res.statusText}`, bodyText)
  }

  return { kind: 'page', data: (await res.json()) as ManPageResponse }
}

export function fetchManByNameAndSection(opts: {
  distro: Distro
  name: string
  section: string
}): Promise<ManPageResponse> {
  const params = new URLSearchParams()
  if (opts.distro !== 'debian') params.set('distro', opts.distro)
  const qs = params.toString()
  return fetchJson<ManPageResponse>(
    `/api/v1/man/${encodeURIComponent(opts.name)}/${encodeURIComponent(opts.section)}${qs ? `?${qs}` : ''}`,
    { next: { revalidate: 300 } },
  )
}

export type RelatedResponse = {
  items: SectionPage[]
}

export function fetchRelated(opts: {
  distro: Distro
  name: string
  section: string
}): Promise<RelatedResponse> {
  const params = new URLSearchParams()
  if (opts.distro !== 'debian') params.set('distro', opts.distro)
  const qs = params.toString()
  return fetchJson<RelatedResponse>(
    `/api/v1/man/${encodeURIComponent(opts.name)}/${encodeURIComponent(opts.section)}/related${qs ? `?${qs}` : ''}`,
    { next: { revalidate: 300 } },
  )
}

export function suggest(opts: { distro: Distro; name: string }): Promise<SuggestResponse> {
  const params = new URLSearchParams()
  params.set('name', opts.name)
  if (opts.distro !== 'debian') params.set('distro', opts.distro)
  return fetchJson<SuggestResponse>(`/api/v1/suggest?${params.toString()}`, {
    next: { revalidate: 300 },
  })
}

export function fetchLicenses(opts: { distro: Distro }): Promise<LicensesResponse> {
  const params = new URLSearchParams()
  if (opts.distro !== 'debian') params.set('distro', opts.distro)
  const qs = params.toString()
  return fetchJson<LicensesResponse>(`/api/v1/licenses${qs ? `?${qs}` : ''}`, {
    next: { revalidate: 300 },
  })
}

export function fetchLicenseText(opts: { distro: Distro; packageName: string }): Promise<LicenseTextResponse> {
  const params = new URLSearchParams()
  if (opts.distro !== 'debian') params.set('distro', opts.distro)
  const qs = params.toString()
  return fetchJson<LicenseTextResponse>(`/api/v1/licenses/${encodeURIComponent(opts.packageName)}${qs ? `?${qs}` : ''}`, {
    next: { revalidate: 300 },
  })
}
