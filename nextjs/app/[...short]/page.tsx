import { notFound, permanentRedirect, redirect } from 'next/navigation'

import { search, withDistroFallback } from '../../lib/api'
import { withDistro } from '../../lib/distro'
import { explicitDistro, explicitLang, resolveRequestDistro, type SearchParams } from '../../lib/requestContext'
import { normalizeManQuery } from '../../lib/manQuery'
import { shareFlag, withShareFlag } from '../../lib/manShare'
import { manPath, parseShortUrl, type ShortUrl } from '../../lib/shortUrl'

function reservedSegments(): Set<string> {
  // Inlined at build time by next.config.ts from the app, pages and public directories.
  const raw = process.env.BM_RESERVED_PATH_SEGMENTS
  if (!raw) throw new Error('BM_RESERVED_PATH_SEGMENTS is not set')
  return new Set(raw.split('/'))
}

// Catch-all params arrive percent-encoded (`c%2B%2B`); a malformed escape matches nothing.
function decodeSegments(segments: string[]): string[] {
  try {
    return segments.map((segment) => decodeURIComponent(segment))
  } catch {
    return []
  }
}

function queryString(sp: SearchParams): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(sp)) {
    for (const item of [value ?? []].flat()) params.append(key, item)
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

// Only what the man page reads travels on (lib/manQuery.ts), so `?utm_source=` and
// the like are dropped here rather than by a second redirect.
function manQueryString(path: string, sp: SearchParams): string {
  const qs = queryString(sp)
  return normalizeManQuery(path, qs) ?? qs
}

// The option index, as search reads it for `tar -x`, maps a flag to its row.
// `?flag=` gives the landing page that option's share card (lib/manShare.ts).
// Without a match, or when the search fails, the reader still lands on the
// page (or its section picker), which settles its own status.
async function optionHref(target: Extract<ShortUrl, { kind: 'option' }>, sp: SearchParams): Promise<string> {
  const urlDistro = explicitDistro(sp)
  const urlLang = explicitLang(sp)
  const pageHref = withDistro(manPath(target.name, target.section), urlDistro, urlLang)
  const found = await withDistroFallback(await resolveRequestDistro(sp), (activeDistro) =>
    search({
      distro: activeDistro,
      q: `${target.name} ${target.flag}`,
      section: target.section ?? undefined,
      limit: 10,
    }),
  ).catch(() => null)
  if (!found) return pageHref

  const hit = found.data.results.find(
    (result) => result.match === 'option' && result.anchorId && result.name.toLowerCase() === target.name,
  )
  if (!hit) return pageHref
  const page = withDistro(manPath(target.name, hit.section), urlDistro, urlLang)
  const flag = shareFlag(target.flag)
  return `${flag ? withShareFlag(page, flag) : page}#${hit.anchorId}`
}

export default async function ShortUrlPage({
  params,
  searchParams,
}: {
  params: Promise<{ short: string[] }>
  searchParams: Promise<SearchParams>
}) {
  const { short } = await params
  const sp = await searchParams
  const target = parseShortUrl(decodeSegments(short), reservedSegments())
  if (!target) notFound()

  switch (target.kind) {
    case 'name':
      return permanentRedirect(`${manPath(target.name)}${manQueryString(manPath(target.name), sp)}`)
    case 'page':
      return permanentRedirect(`${manPath(target.name, target.section)}${manQueryString(manPath(target.name, target.section), sp)}`)
    case 'option':
      // 307: the anchor depends on the release and the reader's distro.
      return redirect(await optionHref(target, sp))
    default: {
      const unreachable: never = target
      throw new Error(`Unhandled short URL ${JSON.stringify(unreachable)}`)
    }
  }
}
