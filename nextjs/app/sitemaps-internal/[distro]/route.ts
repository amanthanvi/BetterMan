import { fetchSeoReleases } from '../../../lib/api'
import { getStaticPublicOrigin } from '../../../lib/public-origin'
import { sitemapIndex, sitemapLastModified, sitemapResponse } from '../../../lib/sitemaps'

export const dynamic = 'force-static'
export const revalidate = 3600

// The corpus lives in Convex at runtime; builds must not require a deployment.
// Unknown paths (including the reserved release index) enter ISR on first access.
export function generateStaticParams() {
  return []
}

type SeoRelease = Awaited<ReturnType<typeof fetchSeoReleases>>['items'][number]

export async function GET(_request: Request, ctx: { params: Promise<{ distro?: string }> }) {
  const { distro } = await ctx.params
  if (!distro) return new Response(null, { status: 404 })
  const origin = getStaticPublicOrigin()
  const releases = await fetchSeoReleases()
  // /sitemap.xml rewrites here so its index can be generated lazily too.
  if (distro === 'index') return sitemapIndex(releases, origin)

  const release = releases.items.find((r: SeoRelease) => r.distro === distro)
  if (!release) return new Response(null, { status: 404 })

  const urlsPerFile = releases.urlsPerFile || 10000
  const pageCount = Math.max(1, Math.ceil(release.pageCount / urlsPerFile))
  const lastmod = sitemapLastModified(release.ingestedAt)

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

  return sitemapResponse(xml)
}
