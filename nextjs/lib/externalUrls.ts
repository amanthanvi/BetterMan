import type { TextRange } from './textRanges'

export type UrlRange = TextRange & { href: string }

const CANDIDATE_RE = /\bhttps?:\/\/[^\s<>"'`]+/gi
const TRAILING_PUNCTUATION = '.,;:!?'
// A dotted host name with a letter TLD; rejects placeholders such as `host` and `server:port`.
const PUBLIC_HOST_RE = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*[a-z0-9]$/i

/** Plain-text http(s) URLs worth linking, with sentence punctuation and unopened `)` trimmed off. */
export function findExternalUrls(text: string): UrlRange[] {
  const out: UrlRange[] = []
  for (const match of text.matchAll(CANDIDATE_RE)) {
    const candidate = trimCandidate(match[0])
    const href = externalHref(candidate)
    if (href) out.push({ start: match.index, end: match.index + candidate.length, href })
  }
  return out
}

function trimCandidate(raw: string): string {
  let s = raw
  for (;;) {
    const last = s.at(-1)
    if (last && TRAILING_PUNCTUATION.includes(last)) s = s.slice(0, -1)
    else if (last === ')' && count(s, '(') < count(s, ')')) s = s.slice(0, -1)
    else return s
  }
}

function count(s: string, ch: string): number {
  return s.split(ch).length - 1
}

/** Templates (`file[1-100].txt`, `{one,two}`), credentials, and bare or numeric hosts are not links. */
function externalHref(candidate: string): string | null {
  if (/[[\]{}]/.test(candidate)) return null
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.username || url.password) return null
  if (!PUBLIC_HOST_RE.test(url.hostname)) return null
  return url.href
}
