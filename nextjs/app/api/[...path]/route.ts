import { api as convexApi } from '../../../../convex/_generated/api'
import type { NextRequest } from 'next/server'

import {
  FastApiError,
  fetchInfo,
  fetchLicenseText,
  fetchLicenses,
  fetchManByName,
  fetchManByNameAndSectionOrAlias,
  fetchManMetaByNameAndSection,
  fetchRelated,
  fetchSeoReleases,
  fetchSeoSitemapPage,
  listSection,
  listSections,
  search,
  suggest,
} from '@/lib/api'
import { getConvexClient } from '@/lib/convexClient'
import { normalizeDistro, type Distro } from '@/lib/distro'

export const runtime = 'nodejs'
const PUBLIC_CACHE_SECONDS = 60 * 60
const SEARCH_CACHE_SECONDS = 5 * 60

type ServerTimingMetric = {
  name: string
  durationMs: number
}

async function measure<T>(metrics: ServerTimingMetric[], name: string, fn: () => Promise<T>): Promise<T> {
  const started = performance.now()
  try {
    return await fn()
  } finally {
    metrics.push({ name, durationMs: performance.now() - started })
  }
}

function attachServerTiming(response: Response, metrics: ServerTimingMetric[]): Response {
  response.headers.set(
    'Server-Timing',
    metrics.map(({ name, durationMs }) => `${name};dur=${durationMs.toFixed(1)}`).join(', '),
  )
  return response
}

function json(value: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(value), { ...init, headers })
}

function cachedJson(value: unknown, seconds = PUBLIC_CACHE_SECONDS, init?: ResponseInit): Response {
  return json(value, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      'Cache-Control': `public, max-age=60, s-maxage=${seconds}, stale-while-revalidate=${seconds}`,
    },
  })
}

function aliasRedirect(req: Request, distro: string, name: string, section: string): Response {
  const url = new URL(req.url)
  url.pathname = `/api/v1/man/${encodeURIComponent(name)}/${encodeURIComponent(section)}`
  if (distro === 'debian') url.searchParams.delete('distro')
  else url.searchParams.set('distro', distro)
  return new Response(null, {
    status: 308,
    headers: { Location: `${url.pathname}${url.search}`, 'Cache-Control': `public, max-age=${PUBLIC_CACHE_SECONDS}` },
  })
}

function apiError(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, { status })
}

function first(value: string | null): string | undefined {
  const trimmed = value?.trim()
  return trimmed || undefined
}

function distroFrom(req: NextRequest): Distro | Response {
  const raw = first(req.nextUrl.searchParams.get('distro'))
  if (!raw) return 'debian'
  const distro = normalizeDistro(raw)
  if (!distro) return apiError(400, 'INVALID_DISTRO', 'Invalid distro')
  return distro
}

function intParam(
  req: NextRequest,
  name: string,
  opts: { defaultValue: number; min: number; max: number },
): number | Response {
  const raw = first(req.nextUrl.searchParams.get(name))
  if (!raw) return opts.defaultValue
  if (!/^\d+$/.test(raw)) {
    return apiError(422, 'INVALID_QUERY_PARAM', `Invalid ${name}`)
  }
  const value = Number(raw)
  if (!Number.isFinite(value) || value < opts.min || value > opts.max) {
    return apiError(422, 'INVALID_QUERY_PARAM', `Invalid ${name}`)
  }
  return value
}

function requestIp(req: NextRequest): string {
  const cf = first(req.headers.get('cf-connecting-ip'))
  if (cf) return cf
  const real = first(req.headers.get('x-real-ip'))
  if (real) return real
  const forwarded = first(req.headers.get('x-forwarded-for'))
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown'
  return 'unknown'
}

async function enforceRateLimit(req: NextRequest, kind: 'search' | 'page'): Promise<Response | null> {
  const result = await getConvexClient().mutation(convexApi.rateLimit.enforce, {
    kind,
    identifier: requestIp(req),
  })

  if (result.allowed) return null
  return apiError(429, 'RATE_LIMITED', 'Too many requests')
}

async function handleGet(req: NextRequest, path: string[], metrics: ServerTimingMetric[]): Promise<Response> {
  if (path[0] !== 'v1') return apiError(404, 'NOT_FOUND', 'Not found')
  const parts = path.slice(1)

  try {
    if (parts.length === 1 && parts[0] === 'info') {
      const distro = distroFrom(req)
      if (distro instanceof Response) return distro
      return cachedJson(await fetchInfo(distro))
    }

    if (parts.length === 1 && parts[0] === 'sections') {
      const limited = await enforceRateLimit(req, 'page')
      if (limited) return limited
      const distro = distroFrom(req)
      if (distro instanceof Response) return distro
      return cachedJson(await listSections(distro))
    }

    if (parts.length === 1 && parts[0] === 'search') {
      const distro = distroFrom(req)
      if (distro instanceof Response) return distro
      const q = first(req.nextUrl.searchParams.get('q'))
      if (!q || q.length > 120) return apiError(400, 'INVALID_QUERY', 'Query is required')
      const limit = intParam(req, 'limit', { defaultValue: 20, min: 1, max: 50 })
      if (limit instanceof Response) return limit
      const offset = intParam(req, 'offset', { defaultValue: 0, min: 0, max: 200 })
      if (offset instanceof Response) return offset
      const section = first(req.nextUrl.searchParams.get('section'))
      const limited = await measure(metrics, 'rate_limit', () => enforceRateLimit(req, 'search'))
      if (limited) return limited
      const result = await measure(metrics, 'convex_search', () => search({ distro, q, section, limit, offset }))
      return cachedJson(result, SEARCH_CACHE_SECONDS)
    }

    if (parts.length === 2 && parts[0] === 'section') {
      const limited = await enforceRateLimit(req, 'page')
      if (limited) return limited
      const distro = distroFrom(req)
      if (distro instanceof Response) return distro
      const limit = intParam(req, 'limit', { defaultValue: 200, min: 1, max: 500 })
      if (limit instanceof Response) return limit
      const offset = intParam(req, 'offset', { defaultValue: 0, min: 0, max: 5000 })
      if (offset instanceof Response) return offset
      return cachedJson(await listSection({ distro, section: parts[1], limit, offset }))
    }

    if (parts.length === 2 && parts[0] === 'man') {
      const limited = await measure(metrics, 'rate_limit', () => enforceRateLimit(req, 'page'))
      if (limited) return limited
      const distro = distroFrom(req)
      if (distro instanceof Response) return distro
      const result = await measure(metrics, 'convex_man', () =>
        fetchManByName({ distro, name: parts[1].toLowerCase() }),
      )
      if (result.kind === 'ambiguous') {
        return cachedJson(
          {
            error: { code: 'AMBIGUOUS_PAGE', message: 'Multiple sections match this name' },
            options: result.options,
          },
          PUBLIC_CACHE_SECONDS,
          { status: 409 },
        )
      }
      if (result.kind === 'alias') return aliasRedirect(req, distro, result.name, result.section)
      return cachedJson(result.data)
    }

    if (parts.length === 3 && parts[0] === 'man') {
      const limited = await measure(metrics, 'rate_limit', () => enforceRateLimit(req, 'page'))
      if (limited) return limited
      const distro = distroFrom(req)
      if (distro instanceof Response) return distro
      const result = await measure(metrics, 'convex_man', () =>
        fetchManByNameAndSectionOrAlias({ distro, name: parts[1].toLowerCase(), section: parts[2] }),
      )
      if (result.kind === 'alias') return aliasRedirect(req, distro, result.name, result.section)
      return cachedJson(result.data)
    }

    if (parts.length === 4 && parts[0] === 'man' && parts[3] === 'meta') {
      const limited = await measure(metrics, 'rate_limit', () => enforceRateLimit(req, 'page'))
      if (limited) return limited
      const distro = distroFrom(req)
      if (distro instanceof Response) return distro
      const result = await measure(metrics, 'convex_man_meta', () =>
        fetchManMetaByNameAndSection({ distro, name: parts[1].toLowerCase(), section: parts[2] }),
      )
      return cachedJson(result)
    }

    if (parts.length === 4 && parts[0] === 'man' && parts[3] === 'related') {
      const limited = await measure(metrics, 'rate_limit', () => enforceRateLimit(req, 'page'))
      if (limited) return limited
      const distro = distroFrom(req)
      if (distro instanceof Response) return distro
      const result = await measure(metrics, 'convex_related', () =>
        fetchRelated({ distro, name: parts[1].toLowerCase(), section: parts[2] }),
      )
      return cachedJson(result)
    }

    if (parts.length === 1 && parts[0] === 'suggest') {
      const limited = await enforceRateLimit(req, 'search')
      if (limited) return limited
      const distro = distroFrom(req)
      if (distro instanceof Response) return distro
      const name = first(req.nextUrl.searchParams.get('name'))
      if (!name || name.length > 200) return apiError(400, 'INVALID_NAME', 'Name is required')
      return cachedJson(await suggest({ distro, name }), SEARCH_CACHE_SECONDS)
    }

    if (parts.length === 1 && parts[0] === 'licenses') {
      const limited = await enforceRateLimit(req, 'page')
      if (limited) return limited
      const distro = distroFrom(req)
      if (distro instanceof Response) return distro
      return cachedJson(await fetchLicenses({ distro }))
    }

    if (parts.length === 2 && parts[0] === 'licenses') {
      const limited = await enforceRateLimit(req, 'page')
      if (limited) return limited
      const distro = distroFrom(req)
      if (distro instanceof Response) return distro
      return cachedJson(await fetchLicenseText({ distro, packageName: parts[1] }))
    }

    if (parts.length === 2 && parts[0] === 'seo' && parts[1] === 'releases') {
      return cachedJson(await fetchSeoReleases())
    }

    if (parts.length === 2 && parts[0] === 'seo' && parts[1] === 'sitemap-page') {
      const distro = distroFrom(req)
      if (distro instanceof Response) return distro
      const page = intParam(req, 'page', { defaultValue: 1, min: 1, max: 1000 })
      if (page instanceof Response) return page
      return cachedJson(await fetchSeoSitemapPage({ distro, page }))
    }
  } catch (err) {
    if (err instanceof FastApiError) {
      return new Response(err.bodyText ?? JSON.stringify({ error: { code: 'API_ERROR', message: err.message } }), {
        status: err.status,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      })
    }
    throw err
  }

  return apiError(404, 'NOT_FOUND', 'Not found')
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await ctx.params
  const metrics: ServerTimingMetric[] = []
  const started = performance.now()
  const response = await handleGet(req, path, metrics)
  metrics.push({ name: 'total', durationMs: performance.now() - started })
  return attachServerTiming(response, metrics)
}

export async function HEAD(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const res = await GET(req, ctx)
  return new Response(null, { status: res.status, headers: res.headers })
}
