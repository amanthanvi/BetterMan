import { createHash } from 'node:crypto'

import { FastApiError, fetchSeoReleases, fetchSeoSitemapPage } from '../../../../lib/api'

function weakEtag(parts: string[]): string {
  const digest = createHash('sha256').update(parts.join('|')).digest('base64url')
  return `W/"${digest}"`
}

function withDistro(loc: string, distro: string): string {
  if (distro === 'debian') return loc
  const url = new URL(loc)
  url.searchParams.set('distro', distro)
  return url.toString()
}

export async function GET(request: Request, ctx: { params: Promise<{ distro?: string; page?: string }> }) {
  const { distro, page: pageRaw } = await ctx.params
  const origin = new URL(request.url).origin
  if (!distro || !pageRaw) return new Response(null, { status: 404 })
  const page = Number(pageRaw)

  if (!Number.isInteger(page) || page < 1) return new Response(null, { status: 404 })

  const releases = await fetchSeoReleases()
  const release = releases.items.find((r) => r.distro === distro)
  if (!release) return new Response(null, { status: 404 })

  const urlsPerFile = releases.urlsPerFile || 10000
  const pageCount = Math.max(1, Math.ceil(release.pageCount / urlsPerFile))
  if (page > pageCount) return new Response(null, { status: 404 })

  const etag = weakEtag(['sitemap-page', distro, release.datasetReleaseId, String(page)])
  const ifNoneMatch = request.headers.get('if-none-match')
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: etag,
        'Cache-Control': 'public, max-age=3600',
      },
    })
  }

  try {
    const data = await fetchSeoSitemapPage({ distro, page })
    const rows = data.items
      .map((item) => {
        const locBase = `${origin}/man/${encodeURIComponent(item.name)}/${encodeURIComponent(item.section)}`
        const loc = withDistro(locBase, distro)
        return `  <url>\n    <loc>${loc}</loc>\n  </url>`
      })
      .join('\n')

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      `${rows}\n` +
      `</urlset>\n`

    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
        ETag: etag,
      },
    })
  } catch (err) {
    if (err instanceof FastApiError && err.status === 404) return new Response(null, { status: 404 })
    throw err
  }
}
