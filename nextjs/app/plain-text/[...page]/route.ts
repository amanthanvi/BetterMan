import {
  FastApiError,
  fetchManByName,
  fetchManByNameAndSectionOrAlias,
  withDistroFallback,
} from '@/lib/api'
import { normalizeDistro, withDistro } from '@/lib/distro'
import { renderManText } from '@/lib/manText'
import { getPublicOrigin } from '@/lib/public-origin'
import { isRateLimited } from '@/lib/rateLimit'
import { isManName, manPath } from '@/lib/shortUrl'

export const runtime = 'nodejs'

type Context = { params: Promise<{ page: string[] }> }

function text(body: string, status = 200, headers?: HeadersInit): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      // Keep the payload cache in lib/api; every request must pass the IP limit.
      'Cache-Control': 'private, no-cache',
      ...headers,
    },
  })
}

export async function GET(request: Request, ctx: Context): Promise<Response> {
  const { page } = await ctx.params
  const [name, section] = page
  if (!name || page.length > 2 || !isManName(name) || (section !== undefined && !/^\d[a-z]{0,9}$/i.test(section))) {
    return text('Page not found\n', 404)
  }
  const rawDistro = new URL(request.url).searchParams.get('distro')?.trim()
  const requestedDistro = rawDistro ? normalizeDistro(rawDistro) : 'debian'
  if (!requestedDistro) return text('Invalid distro\n', 400)
  if (await isRateLimited(request.headers, 'page')) return text('Too many requests\n', 429)

  try {
    const { distro, data } = await withDistroFallback(requestedDistro, (distro) =>
      section === undefined
        ? fetchManByName({ distro, name: name.toLowerCase() })
        : fetchManByNameAndSectionOrAlias({ distro, name: name.toLowerCase(), section: section.toLowerCase() }),
    )
    if (data.kind === 'ambiguous') {
      return text(`Multiple sections match ${name}. Choose a plain-text page:\n${data.options.map((option) => withDistro(`${manPath(name, option.section)}.txt`, distro)).join('\n')}\n`, 409)
    }
    if (data.kind === 'alias') {
      return text('', 308, { Location: withDistro(`${manPath(data.name, data.section)}.txt`, distro) })
    }
    const canonical = `${getPublicOrigin(request)}${withDistro(manPath(data.data.page.name, data.data.page.section), distro)}`
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
