import { packageName } from '@/lib/packageName'
import {
  FastApiError,
  fetchManResolve,
  fetchManByNameAndSectionOrAlias,
  withDistroFallback,
  servedRelease,
} from '@/lib/api'
import { normalizeDistro, withDistro } from '@/lib/distro'
import { manCanonicalPath } from '@/lib/manCanonical'
import { trustedProxyRelease } from '@/lib/manRelease'
import { isIndexable } from '@/lib/manRobots'
import { renderManText } from '@/lib/manText'
import { getPublicOrigin } from '@/lib/public-origin'
import { isRateLimited } from '@/lib/rateLimit'
import { nonHtmlSecurityHeaders } from '@/lib/securityHeaders'
import { decodeManParam, isManName, manPath, parseShortUrl } from '@/lib/shortUrl'

export const runtime = 'nodejs'

type Context = { params: Promise<{ page: string[] }> }

function text(body: string, status = 200, headers?: HeadersInit): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      ...nonHtmlSecurityHeaders(),
      // Match the page API: cache public content at the edge, limit origin reads.
      'Cache-Control': status < 400 ? 'public, max-age=60, s-maxage=3600, stale-while-revalidate=3600' : 'private, no-store',
      ...headers,
    },
  })
}

export async function GET(request: Request, ctx: Context): Promise<Response> {
  const { page } = await ctx.params
  let [name, section] = page.map(decodeManParam)
  if (!name || page.length > 2 || !isManName(name) || (section !== undefined && !/^\d[a-z]{0,9}$/i.test(section))) {
    return text('Page not found\n', 404)
  }
  if (section === undefined) {
    const target = parseShortUrl([name], new Set())
    if (!target || target.kind === 'option') return text('Page not found\n', 404)
    name = target.name
    if (target.kind === 'page') section = target.section
  }
  const pkg = packageName(new URL(request.url).searchParams.get('pkg'))
  const textHref = (path: string, selected = pkg) => {
    const href = withDistro(path, urlDistro)
    return selected ? `${href}${href.includes('?') ? '&' : '?'}pkg=${encodeURIComponent(selected)}` : href
  }
  const rawDistro = new URL(request.url).searchParams.get('distro')?.trim()
  const urlDistro = rawDistro ? normalizeDistro(rawDistro) : null
  if (rawDistro && !urlDistro) return text('Invalid distro\n', 400)
  const requestedDistro = urlDistro ?? 'debian'
  const proxyRelease = trustedProxyRelease(Object.fromEntries(request.headers))
  const release = proxyRelease?.datasetReleaseId
  // A request that bypasses the proxy cannot use a shared data-cache key.
  const lookupRelease = proxyRelease === undefined ? `unknown:${crypto.randomUUID()}` : release
  const cacheHeaders = (answered: string | null): HeadersInit =>
    release && answered === release ? {} : { 'Cache-Control': 'private, no-store' }
  if (await isRateLimited(request.headers, 'page')) return text('Too many requests\n', 429)

  try {
    const { distro, data } = await withDistroFallback(requestedDistro, async (distro) =>
      section === undefined
        ? await fetchManResolve({ distro, name: name.toLowerCase(), release: lookupRelease })
        : await fetchManByNameAndSectionOrAlias({ distro, name, section: section.toLowerCase(), release: lookupRelease, ...(pkg ? { pkg } : {}) }),
    )
    const headers = cacheHeaders(servedRelease(data))
    if (data.kind === 'ambiguous') {
      return text(`Multiple sections match ${name}. Choose a plain-text page:\n${data.options.map((option) => textHref(`${manPath(name, option.section)}.txt`)).join('\n')}\n`, 409)
    }
    if (data.kind === 'alias' || !('data' in data)) {
      return text('', 308, { ...headers, Location: textHref(`${manPath(data.name, data.section)}.txt`, 'pkg' in data ? packageName(data.pkg) : undefined) })
    }
    const canonical = `${getPublicOrigin(request)}${manCanonicalPath(data.data, distro, pkg)}`
    return text(renderManText(data.data), 200, { ...headers, Link: `<${canonical}>; rel="canonical"`, ...(!isIndexable(data.data.page) ? { 'X-Robots-Tag': 'noindex' } : {}) })
  } catch (err) {
    if (err instanceof FastApiError) {
      return text(err.status === 404 ? 'Page not found\n' : 'Page temporarily unavailable\n', err.status)
    }
    throw err
  }
}

export async function HEAD(request: Request, ctx: Context): Promise<Response> {
  const res = await GET(request, ctx)
  return new Response(null, { status: res.status, headers: res.headers })
}
