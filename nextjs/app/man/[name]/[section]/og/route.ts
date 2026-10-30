import { isIndexable } from '@/lib/manRobots'
import { packageName } from '@/lib/packageName'
import { notFound } from 'next/navigation'

import { ogCard, type OgCardInput } from '../../../../../lib/og/card'
import { FastApiError, fetchManByNameAndSectionOrAlias, fetchManMetaByNameAndSection, withDistroFallback } from '../../../../../lib/api'
import { sectionLabel } from '../../../../../components/man/RunningHead'
import { DISTRO_LABEL, normalizeDistro, type Distro } from '../../../../../lib/distro'
import type { ManPage } from '../../../../../lib/docModel'
import { isManQuery } from '../../../../../lib/manQuery'
import { manOption, SHARE_FLAG_PARAM, shareFlag } from '../../../../../lib/manShare'
import { isValidManImageParams } from '../../../../../lib/og/input'
import { isRateLimited } from '../../../../../lib/rateLimit'
import { servingRelease } from '../../../../../lib/manRelease'
import { parseReleaseId, releaseDay } from '../../../../../lib/release'
import { decodeManParam } from '../../../../../lib/shortUrl'
import { nonHtmlSecurityHeaders } from '../../../../../lib/securityHeaders'

type CardData = { page: ManPage; option?: OgCardInput['option']; generated?: OgCardInput['generated'] }

/** No page, package or option to draw: the answer depends on the release, so it is a private 404. */
class NoCard extends Error {}

function noCard(): Response {
  return new Response(null, { status: 404, headers: { ...nonHtmlSecurityHeaders(), 'Cache-Control': 'private, no-store' } })
}

/** The whole page, for a flag's option or a generated summary; an alias has neither. */
async function fullPage(distro: Distro, name: string, section: string, pkg: string | null) {
  const found = await fetchManByNameAndSectionOrAlias({ distro, name, section, ...(pkg ? { pkg } : {}) })
  if (found.kind !== 'page') throw new NoCard()
  return found.data
}

async function cardData(distro: Distro, name: string, section: string, pkg: string | null, flag: string | null): Promise<CardData> {
  if (flag) {
    const data = await fullPage(distro, name, section, pkg)
    const option = manOption(data.content.options, flag)
    if (!option) throw new NoCard()
    return { page: data.page, option: { flags: option.flags, argument: option.argument, description: option.description } }
  }
  const { page } = await fetchManMetaByNameAndSection({ distro, name, section, ...(pkg ? { pkg } : {}) })
  if (page.description) return { page }
  // Without a NAME line the card may carry BetterMan's generated summary, labelled.
  const { brief } = await fullPage(distro, name, section, pkg)
  if (!brief?.summary || !brief.generated) return { page }
  return { page, generated: { text: brief.summary, label: `generated · ${brief.generated.model}, ${brief.generated.generatedAt}` } }
}

/** The day the page's release was built, from its id; an id without one (legacy, test) takes the active release's date when it is that release. */
async function releaseDate(page: ManPage, distro: Distro): Promise<string | undefined> {
  const builtAt = parseReleaseId(page.datasetReleaseId).builtAt
  if (builtAt) return releaseDay(builtAt)
  const active = await servingRelease(distro).catch(() => null)
  return active?.datasetReleaseId === page.datasetReleaseId ? releaseDay(active.lastUpdated) : undefined
}

/*
 * A route handler rather than opengraph-image.tsx: metadata image routes only
 * receive params, and the share image has to follow ?distro= and ?pkg= like the
 * page, and ?flag= for one option's card (lib/manShare.ts).
 */
export async function GET(request: Request, ctx: { params: Promise<{ name: string; section: string }> }) {
  const { name: rawName, section: rawSection } = await ctx.params
  const name = decodeManParam(rawName)
  const section = decodeManParam(rawSection)
  const params = new URL(request.url).searchParams
  const rawFlag = params.get(SHARE_FLAG_PARAM)
  const flag = shareFlag(rawFlag)
  if (!isValidManImageParams(name, section) || (rawFlag !== null && !flag)) notFound()
  if (await isRateLimited(request.headers, 'page')) {
    return new Response(null, { status: 429, headers: { ...nonHtmlSecurityHeaders(), 'Cache-Control': 'private, no-store' } })
  }

  const requestedDistro = normalizeDistro(params.get('distro')) ?? 'debian'
  const pkg = packageName(params.get('pkg')) ?? null
  let found: Awaited<ReturnType<typeof withDistroFallback<CardData>>>
  try {
    found = await withDistroFallback(requestedDistro, (distro) => cardData(distro, name, section, pkg, flag))
  } catch (err) {
    if (err instanceof NoCard || (err instanceof FastApiError && err.status === 404)) return noCard()
    throw err
  }
  const { distro, data } = found

  const response = await ogCard({
    name: data.page.name,
    section: data.page.section,
    label: sectionLabel(section),
    description: data.option ? undefined : data.page.description || (data.generated ? undefined : data.page.title),
    ...(data.option ? { option: data.option } : {}),
    ...(data.generated ? { generated: data.generated } : {}),
    distro: DISTRO_LABEL[distro],
    date: await releaseDate(data.page, distro),
  })
  // Cards change only with a dataset release. A day fresh, then served stale
  // while the CDN refreshes, bounds how long an old card outlives a release.
  // Anything the proxy would have redirected (lib/manQuery.ts) is answered privately.
  const query: Record<string, string | string[]> = {}
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key)
    query[key] = values.length === 1 ? values[0]! : values
  }
  response.headers.set('Cache-Control', isManQuery('/man/_/_/og', query, [])
    ? 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800'
    : 'private, no-store')
  if (!isIndexable(data.page)) response.headers.set('X-Robots-Tag', 'noindex')
  return response
}
