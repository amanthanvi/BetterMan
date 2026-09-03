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
