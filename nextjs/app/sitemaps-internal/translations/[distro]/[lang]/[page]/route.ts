import { createHash } from 'node:crypto'

import { FastApiError, fetchTranslationSitemap } from '../../../../../../lib/api'
import { normalizeDistro } from '../../../../../../lib/distro'
import { translatedLang } from '../../../../../../lib/i18n/locales'
import { getPublicOrigin } from '../../../../../../lib/public-origin'
import { translationUrlset } from '../../../../../../lib/translationSitemap'

export const dynamic = 'force-dynamic'

function weakEtag(parts: string[]): string {
  const digest = createHash('sha256').update(parts.join('|')).digest('base64url')
  return `W/"${digest}"`
}

/** One sitemap page of one language's translated pages (#395); ingestion puts 1,000 on each. */
export async function GET(request: Request, ctx: { params: Promise<{ distro?: string; lang?: string; page?: string }> }) {
  const params = await ctx.params
  const distro = normalizeDistro(params.distro)
  const lang = translatedLang(params.lang)
  const page = Number(params.page)
  if (!distro || !lang || params.lang !== lang || !Number.isInteger(page) || page < 1 || String(page) !== params.page) {
    return new Response(null, { status: 404 })
  }
  try {
    const data = await fetchTranslationSitemap({ distro, lang, page })
    const etag = weakEtag(['sitemap-translations', distro, lang, String(page), data.datasetReleaseId])
    if (request.headers.get('if-none-match') === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': 'public, max-age=3600' } })
    }
    return new Response(translationUrlset(getPublicOrigin(request), distro, lang, data.items), {
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
