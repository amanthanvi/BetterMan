import { notFound } from 'next/navigation'

import { ogCard } from '../../../../../lib/og/card'
import { FastApiError, fetchManMetaByNameAndSection, withDistroFallback } from '../../../../../lib/api'
import { sectionLabel } from '../../../../../components/man/RunningHead'
import { normalizeDistro } from '../../../../../lib/distro'
import { isValidManImageParams } from '../../../../../lib/og/input'
import { isRateLimited } from '../../../../../lib/rateLimit'

/*
 * A route handler rather than opengraph-image.tsx: metadata image routes only
 * receive params, and the share image has to follow ?distro= like the page.
 */
export async function GET(request: Request, ctx: { params: Promise<{ name: string; section: string }> }) {
  const { name, section } = await ctx.params
  if (!isValidManImageParams(name, section)) notFound()
  if (await isRateLimited(request.headers, 'page')) {
    return new Response(null, { status: 429, headers: { 'Cache-Control': 'private, no-store' } })
  }

  const requestedDistro = normalizeDistro(new URL(request.url).searchParams.get('distro')) ?? 'debian'
  const { data } = await (async () => {
    try {
      return await withDistroFallback(requestedDistro, (distro) =>
        fetchManMetaByNameAndSection({ distro, name: name.toLowerCase(), section }),
      )
    } catch (err) {
      if (err instanceof FastApiError && err.status === 404) notFound()
      throw err
    }
  })()

  const title = `${data.page.name}(${data.page.section})`

  const response = await ogCard({
    head: title.toUpperCase(),
    label: sectionLabel(section),
    name: title,
    description: data.page.description || data.page.title,
  })
  // Cards change only with a dataset release. A day fresh, then served stale
  // while the CDN refreshes, bounds how long an old card outlives a release.
  response.headers.set('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800')
  return response
}
