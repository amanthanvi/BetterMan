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
  withDistroFallback,
  type Suggestion,
} from '@/lib/api'
import { normalizeDistro, withDistro, type Distro } from '@/lib/distro'
import { getPublicOrigin } from '@/lib/public-origin'
import { isRateLimited } from '@/lib/rateLimit'
import { nonHtmlSecurityHeaders } from '@/lib/securityHeaders'
import { isManName, manPath } from '@/lib/shortUrl'

export const runtime = 'nodejs'
const PUBLIC_CACHE_SECONDS = 60 * 60
const SEARCH_CACHE_SECONDS = 5 * 60
// Text that cannot be a man page name never has suggestions, in any release.
const NO_SUGGESTIONS_CACHE_SECONDS = 24 * 60 * 60
const OPENSEARCH_JSON = { headers: { 'Content-Type': 'application/x-suggestions+json; charset=utf-8' } }

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
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json; charset=utf-8')
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

// OpenSearch suggestions: [query, completions, descriptions, URLs], one row per name.
function openSearchSuggestions(req: NextRequest, query: string, suggestions: Suggestion[], distro: Distro): Response {
  const origin = getPublicOrigin(req)
  const byName = new Map<string, Suggestion[]>()
  for (const suggestion of suggestions) {
    const key = suggestion.name.toLowerCase()
    byName.set(key, [...(byName.get(key) ?? []), suggestion])
  }
  const rows = [...byName.entries()].map(([name, pages]) => ({
    name: pages[0].name,
    description: pages[0].description,
    url: `${origin}${withDistro(manPath(name, pages.length === 1 ? pages[0].section : null), distro)}`,
  }))
  return cachedJson(
    [query, rows.map((row) => row.name), rows.map((row) => row.description), rows.map((row) => row.url)],
    SEARCH_CACHE_SECONDS,
    OPENSEARCH_JSON,
  )
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

async function enforceRateLimit(req: NextRequest, kind: 'search' | 'page'): Promise<Response | null> {
  if (!(await isRateLimited(req.headers, kind))) return null
  return json({ error: { code: 'RATE_LIMITED', message: 'Too many requests' } }, {
    status: 429,
    headers: { ...nonHtmlSecurityHeaders(), 'Cache-Control': 'private, no-store' },
  })
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

    if (parts.length === 2 && (parts[0] === 'section' || parts[0] === 'sections')) {
      const limited = await enforceRateLimit(req, 'page')
      if (limited) return limited
      const distro = distroFrom(req)
      if (distro instanceof Response) return distro
      const limit = intParam(req, 'limit', { defaultValue: 200, min: 1, max: 500 })
      if (limit instanceof Response) return limit
      const cursor = req.nextUrl.searchParams.get('cursor') ?? undefined
      const before = req.nextUrl.searchParams.get('before') ?? undefined
      if (cursor !== undefined && before !== undefined) {
        return apiError(422, 'INVALID_QUERY_PARAM', 'Use either cursor or before, not both')
      }
      const offset = intParam(req, 'offset', {
        defaultValue: 0,
        min: 0,
        max: cursor !== undefined || before !== undefined ? Number.MAX_SAFE_INTEGER : 5000,
      })
      if (offset instanceof Response) return offset
      return cachedJson(await listSection({
        distro,
        section: parts[1],
        limit,
        offset,
        ...(cursor === undefined ? {} : { cursor }),
        ...(before === undefined ? {} : { before }),
      }))
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
      // Input is settled before the rate limit, which is itself a Convex call.
      const distro = distroFrom(req)
      if (distro instanceof Response) return distro
      // `q` is the spelling the OpenSearch descriptor uses. OpenSearch clients
      // drop a response whose query is not their raw text, trailing space included.
      const raw = req.nextUrl.searchParams.get('name') ?? req.nextUrl.searchParams.get('q') ?? ''
      const name = raw.trim()
      if (!name || name.length > 200) return apiError(400, 'INVALID_NAME', 'Name is required')
      const format = first(req.nextUrl.searchParams.get('format'))
      if (format !== undefined && format !== 'opensearch') {
        return apiError(422, 'INVALID_QUERY_PARAM', 'Invalid format')
      }
      if (!isManName(name)) {
        const empty = format === 'opensearch' ? [raw, []] : { query: name.toLowerCase(), suggestions: [], distro }
        return cachedJson(empty, NO_SUGGESTIONS_CACHE_SECONDS, format === 'opensearch' ? OPENSEARCH_JSON : undefined)
      }
      const limited = await enforceRateLimit(req, 'search')
      if (limited) return limited
      // Like the man page, fall back to Debian without an active release, and say
      // so, so the caller does not label Debian rows as the requested distro.
      const { distro: resolved, data } = await withDistroFallback(distro, (activeDistro) =>
        suggest({ distro: activeDistro, name }),
      )
      if (format === 'opensearch') return openSearchSuggestions(req, raw, data.suggestions, resolved)
      return cachedJson({ ...data, distro: resolved }, SEARCH_CACHE_SECONDS)
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
