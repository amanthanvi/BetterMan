/**
 * Dataset release ids look like
 * `2026-09-01T05:14:24Z+debian+2e579f1+mandoc:1.14.6-4`.
 * Readers only need the date and the mandoc version; the raw id stays
 * available in a tooltip and on the licenses page.
 */
export type ReleaseParts = {
  builtAt: string | null
  distro: string | null
  gitSha: string | null
  mandocVersion: string | null
}

export function parseReleaseId(id: string): ReleaseParts {
  const [builtAt, distro, gitSha, ...rest] = id.split('+')
  const mandoc = rest.find((part) => part.startsWith('mandoc:'))
  const mandocVersion = mandoc ? mandoc.slice('mandoc:'.length).split('-')[0] || null : null
  return {
    builtAt: builtAt && !Number.isNaN(Date.parse(builtAt)) ? builtAt : null,
    distro: distro || null,
    gitSha: gitSha && gitSha !== 'unknown' ? gitSha : null,
    mandocVersion,
  }
}

/** A release's day as the site writes it, Oct 28, 2026; undefined for an unreadable date. */
export function releaseDay(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return undefined
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
}
