import { createHash } from 'node:crypto'

import type { SeoReleasesResponse } from './api'

export function sitemapLastModified(iso: string): string | null {
  const dt = new Date(iso)
  if (!Number.isFinite(dt.getTime())) return null
  return dt.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function sitemapResponse(xml: string): Response {
  // A validator for the actual cached bytes (including origin/lastmod). Do not
  // read If-None-Match here: ISR output cannot depend on the requesting crawler.
  const digest = createHash('sha256').update(xml).digest('base64url')
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
      ETag: `W/"${digest}"`,
    },
  })
}

export function sitemapIndex(releases: SeoReleasesResponse, origin: string): Response {
  const rows = releases.items
    .slice()
    .sort((a, b) => a.distro.localeCompare(b.distro))
    .map((r) => {
      const lastmod = sitemapLastModified(r.ingestedAt)
      const loc = `${origin}/sitemap-${r.distro}.xml`
      return `  <sitemap>\n    <loc>${loc}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}\n  </sitemap>`
    })
    .join('\n')

  return sitemapResponse(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${rows}\n` +
    `</sitemapindex>\n`,
  )
}
