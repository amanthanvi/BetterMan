import {
  FastApiError,
  fetchManResolve,
  fetchManByNameAndSectionOrAlias,
  withDistroFallback,
} from '@/lib/api'
import { canonicalWithDistro, normalizeDistro, withDistro } from '@/lib/distro'
import { renderManText } from '@/lib/manText'
import { getPublicOrigin } from '@/lib/public-origin'
import { isRateLimited } from '@/lib/rateLimit'
import { nonHtmlSecurityHeaders } from '@/lib/securityHeaders'
import { isManName, manPath, parseShortUrl } from '@/lib/shortUrl'

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
  let [name, section] = page
  if (!name || page.length > 2 || !isManName(name) || (section !== undefined && !/^\d[a-z]{0,9}$/i.test(section))) {
    return text('Page not found\n', 404)
  }
  if (section === undefined) {
    const target = parseShortUrl([name], new Set())
    if (!target || target.kind === 'option') return text('Page not found\n', 404)
    name = target.name
    if (target.kind === 'page') section = target.section
  }
  const rawDistro = new URL(request.url).searchParams.get('distro')?.trim()
  const urlDistro = rawDistro ? normalizeDistro(rawDistro) : null
  if (rawDistro && !urlDistro) return text('Invalid distro\n', 400)
  const requestedDistro = urlDistro ?? 'debian'
  if (await isRateLimited(request.headers, 'page')) return text('Too many requests\n', 429)

  try {
    const { distro, data } = await withDistroFallback(requestedDistro, async (distro) =>
      section === undefined
        ? await fetchManResolve({ distro, name: name.toLowerCase() })
        : await fetchManByNameAndSectionOrAlias({ distro, name: name.toLowerCase(), section: section.toLowerCase() }),
    )
    if (data.kind === 'ambiguous') {
      return text(`Multiple sections match ${name}. Choose a plain-text page:\n${data.options.map((option) => withDistro(`${manPath(name, option.section)}.txt`, urlDistro)).join('\n')}\n`, 409)
    }
    if (data.kind === 'alias' || !('data' in data)) {
      return text('', 308, { Location: withDistro(`${manPath(data.name, data.section)}.txt`, urlDistro) })
    }
    const canonical = `${getPublicOrigin(request)}${canonicalWithDistro(manPath(data.data.page.name, data.data.page.section), distro)}`
    return text(renderManText(data.data), 200, { Link: `<${canonical}>; rel="canonical"` })
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
