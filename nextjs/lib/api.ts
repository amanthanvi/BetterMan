import { fastapiUrl } from './fastapi'
import type { Distro } from './distro'

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

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(fastapiUrl(path), {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!res.ok) {
    throw new Error(`FastAPI request failed: ${res.status} ${res.statusText}`)
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
