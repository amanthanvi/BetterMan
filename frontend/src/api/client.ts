import type {
  AmbiguousOption,
  ApiErrorEnvelope,
  InfoResponse,
  ManPageResponse,
  RelatedResponse,
  SearchResponse,
  SectionLabel,
  SectionResponse,
} from './types'

export class ApiHttpError extends Error {
  status: number
  code?: string
  payload?: unknown

  constructor(message: string, opts: { status: number; code?: string; payload?: unknown }) {
    super(message)
    this.name = 'ApiHttpError'
    this.status = opts.status
    this.code = opts.code
    this.payload = opts.payload
  }
}

async function parseJsonSafely(res: Response): Promise<unknown | undefined> {
  try {
    return await res.json()
  } catch {
    return undefined
  }
}

function asErrorEnvelope(payload: unknown): ApiErrorEnvelope | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  const maybe = payload as Record<string, unknown>
  const error = maybe.error as Record<string, unknown> | undefined
  if (!error) return undefined
  if (typeof error.code !== 'string') return undefined
  if (typeof error.message !== 'string') return undefined
  return { error: { code: error.code, message: error.message } }
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })

  const payload = await parseJsonSafely(res)
  if (!res.ok) {
    const envelope = asErrorEnvelope(payload)
    throw new ApiHttpError(envelope?.error.message ?? 'Request failed', {
      status: res.status,
      code: envelope?.error.code,
      payload,
    })
  }
  return payload as T
}

export function fetchInfo(): Promise<InfoResponse> {
  return apiGet<InfoResponse>('/api/v1/info')
}

export function search(opts: {
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
  return apiGet<SearchResponse>(`/api/v1/search?${params.toString()}`)
}

export function listSections(): Promise<SectionLabel[]> {
  return apiGet<SectionLabel[]>('/api/v1/sections')
}

export function listSection(
  section: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<SectionResponse> {
  const params = new URLSearchParams()
  if (typeof opts.limit === 'number') params.set('limit', String(opts.limit))
  if (typeof opts.offset === 'number') params.set('offset', String(opts.offset))
  const qs = params.toString()
  return apiGet<SectionResponse>(`/api/v1/section/${encodeURIComponent(section)}${qs ? `?${qs}` : ''}`)
}

export type ManByNameResult =
  | { kind: 'page'; data: ManPageResponse }
  | { kind: 'ambiguous'; options: AmbiguousOption[] }

export async function fetchManByName(name: string): Promise<ManByNameResult> {
  const res = await fetch(`/api/v1/man/${encodeURIComponent(name)}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })

  const payload = await parseJsonSafely(res)

  if (res.status === 409) {
    const options = (payload as { options?: AmbiguousOption[] } | undefined)?.options
    return { kind: 'ambiguous', options: Array.isArray(options) ? options : [] }
  }

  if (!res.ok) {
    const envelope = asErrorEnvelope(payload)
    throw new ApiHttpError(envelope?.error.message ?? 'Request failed', {
      status: res.status,
      code: envelope?.error.code,
      payload,
    })
  }

  return { kind: 'page', data: payload as ManPageResponse }
}

export function fetchManByNameAndSection(name: string, section: string): Promise<ManPageResponse> {
  return apiGet<ManPageResponse>(`/api/v1/man/${encodeURIComponent(name)}/${encodeURIComponent(section)}`)
}

export function fetchRelated(name: string, section: string): Promise<RelatedResponse> {
  return apiGet<RelatedResponse>(
    `/api/v1/man/${encodeURIComponent(name)}/${encodeURIComponent(section)}/related`,
  )
}

