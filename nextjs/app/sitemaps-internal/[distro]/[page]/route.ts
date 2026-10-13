import { FastApiError, fetchSeoReleases, fetchSeoSitemapPage } from '../../../../lib/api'
import { withDistro } from '../../../../lib/distro'
import { getStaticPublicOrigin } from '../../../../lib/public-origin'
import { sitemapResponse } from '../../../../lib/sitemaps'

export const dynamic = 'force-static'
export const revalidate = 3600

export function generateStaticParams() {
  return []
}

type SeoRelease = Awaited<ReturnType<typeof fetchSeoReleases>>['items'][number]
type SeoSitemapItem = Awaited<ReturnType<typeof fetchSeoSitemapPage>>['items'][number]

export async function GET(_request: Request, ctx: { params: Promise<{ distro?: string; page?: string }> }) {
  const { distro, page: pageRaw } = await ctx.params
  const origin = getStaticPublicOrigin()
  if (!distro || !pageRaw) return new Response(null, { status: 404 })
  const page = Number(pageRaw)

  if (!Number.isInteger(page) || page < 1) return new Response(null, { status: 404 })

  const releases = await fetchSeoReleases()
  const release = releases.items.find((r: SeoRelease) => r.distro === distro)
  if (!release) return new Response(null, { status: 404 })

  const urlsPerFile = releases.urlsPerFile || 10000
  const pageCount = Math.max(1, Math.ceil(release.pageCount / urlsPerFile))
  if (page > pageCount) return new Response(null, { status: 404 })

  try {
    const data = await fetchSeoSitemapPage({ distro, page })
    const rows = data.items
      .map((item: SeoSitemapItem) => {
        const locBase = `${origin}/man/${encodeURIComponent(item.name)}/${encodeURIComponent(item.section)}`
        const loc = withDistro(locBase, distro)
        return `  <url>\n    <loc>${loc}</loc>\n  </url>`
      })
      .join('\n')

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      `${rows}\n` +
      `</urlset>\n`

    return sitemapResponse(xml)
  } catch (err) {
    if (err instanceof FastApiError && err.status === 404) return new Response(null, { status: 404 })
    throw err
  }
}
