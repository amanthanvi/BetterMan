import { createHash } from 'node:crypto'

import { fetchSeoReleases } from '../../../lib/api'
import { getPublicOrigin } from '../../../lib/public-origin'

function toIsoZ(iso: string): string | null {
  const dt = new Date(iso)
  if (!Number.isFinite(dt.getTime())) return null
  return dt.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function weakEtag(parts: string[]): string {
  const digest = createHash('sha256').update(parts.join('|')).digest('base64url')
  return `W/"${digest}"`
}

export async function GET(request: Request, ctx: { params: Promise<{ distro?: string }> }) {
  const { distro } = await ctx.params
  if (!distro) return new Response(null, { status: 404 })
  const origin = getPublicOrigin(request)
  const releases = await fetchSeoReleases()

  const release = releases.items.find((r) => r.distro === distro)
  if (!release) return new Response(null, { status: 404 })

  const urlsPerFile = releases.urlsPerFile || 10000
  const pageCount = Math.max(1, Math.ceil(release.pageCount / urlsPerFile))
  const lastmod = toIsoZ(release.ingestedAt)

  const etag = weakEtag(['sitemap-distro-index', distro, release.datasetReleaseId, String(pageCount)])
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

  const rows = Array.from({ length: pageCount }, (_, idx) => idx + 1)
    .map((page) => {
      const loc = `${origin}/sitemap-${distro}-${page}.xml`
      return `  <sitemap>\n    <loc>${loc}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}\n  </sitemap>`
    })
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${rows}\n` +
    `</sitemapindex>\n`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      ETag: etag,
    },
  })
}
