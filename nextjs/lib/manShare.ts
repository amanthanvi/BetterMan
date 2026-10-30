import { flagKey, optionFlagRows } from '../../convex/_optionFlags'

import type { OptionItem } from './docModel'

/**
 * Per-flag share cards. A flag's share URL is its short URL, `/tar/-x`, which
 * lands on `/man/tar/1?flag=-x#x`: the fragment selects the option, and `?flag=`
 * makes the page's share image `/man/tar/1/og?flag=-x`, the card for that one
 * option. `flag` is a single key as the options index stores it (`-x`,
 * `--extract`, `--sort` for `--sort=WORD`), matched case-sensitively; a flag
 * the page does not define is dropped by a private redirect, so each real
 * option is the only cached variant (lib/manQuery.ts). The page's canonical URL
 * never carries `flag`.
 */
export const SHARE_FLAG_PARAM = 'flag'

/** `?flag=` when it is one flag key, else null. */
export function shareFlag(value: string | null | undefined): string | null {
  return value && flagKey(value) === value ? value : null
}

/** The option that defines `flag` on this page, the first to define it, as the options index reads it. */
export function manOption(options: OptionItem[] | null | undefined, flag: string): OptionItem | null {
  if (!shareFlag(flag)) return null
  const row = optionFlagRows(options).find((candidate) => candidate.flag === flag)
  return row ? (options ?? []).find((option) => option.anchorId === row.anchorId) ?? null : null
}

/** Appends `?flag=` (or `&flag=`) to a page or share-image URL. */
export function withShareFlag(url: string, flag: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}${SHARE_FLAG_PARAM}=${encodeURIComponent(flag)}`
}
