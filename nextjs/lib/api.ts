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

