import { headers } from 'next/headers'
import { notFound } from 'next/navigation'

import { OG_SIZE, ogCard } from '../../../../lib/og/card'
import { FastApiError, fetchManMetaByNameAndSection, withDistroFallback } from '../../../../lib/api'
import { sectionLabel } from '../../../../components/man/RunningHead'
import { isValidManImageParams } from '../../../../lib/og/input'
import { isRateLimited } from '../../../../lib/rateLimit'

export const alt = 'Man page'
export const size = OG_SIZE
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ name: string; section: string }> }) {
  const { name, section } = await params
  if (!isValidManImageParams(name, section)) notFound()
  if (await isRateLimited(await headers(), 'page')) {
    return new Response(null, { status: 429, headers: { 'Cache-Control': 'private, no-store' } })
  }

  const { data } = await (async () => {
    try {
      return await withDistroFallback('debian', (distro) =>
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
  // Cards change only when a dataset release does; let the CDN absorb crawler fetches.
  response.headers.set('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800')
  return response
}
