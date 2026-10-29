export type ShortUrl =
  | { kind: 'name'; name: string }
  | { kind: 'page'; name: string; section: string }
  | { kind: 'option'; name: string; section: string | null; flag: string }

const NAME = /^[a-z0-9_+[][\w.+:@[\]-]{0,199}$/i
// A digit, then letters: `1`, `3p`, `1ssl`. `python3.11` stays a name.
const SECTION = /^\d[a-z]{0,9}$/i
const FLAG = /^--?[^\s/-][^\s/]{0,79}$/
// A name without a section that ends in one of these is a scanner probe or an
// asset, not an HTML man page. `.txt` is handled by the plain-text rewrites.
// `package.json.5` still works: the section suffix says it is a man page.
const NOT_A_PAGE = new Set([
  'txt',
  'php', 'phtml', 'asp', 'aspx', 'jsp', 'cgi',
  'html', 'htm', 'xhtml', 'xml', 'json', 'js', 'mjs', 'cjs', 'map', 'css',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'ico', 'bmp',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'zip', 'gz', 'tgz', 'rar', 'sql', 'bak', 'env',
])

/** Next's HTML page params preserve percent escapes; decode only at that boundary. */
export function decodeManParam(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    // A malformed escape cannot match an ingested name; retain it for the 404.
    return segment
  }
}

/** True when `value` can be a man page name, so a lookup for it is worth a query. */
export function isManName(value: string): boolean {
  return NAME.test(value)
}

function splitSection(segment: string): { name: string; section: string | null } | null {
  const dot = segment.lastIndexOf('.')
  const suffix = segment.slice(dot + 1)
  if (dot > 0 && SECTION.test(suffix)) return { name: segment.slice(0, dot), section: suffix.toLowerCase() }
  if (dot >= 0 && NOT_A_PAGE.has(suffix.toLowerCase())) return null
  return { name: segment, section: null }
}

/**
 * Reads `/tar`, `/tar.1`, `/2/open`, `/tar/-x`, and `/tar.1/--extract`. Returns
 * null for anything else, including any path under a reserved first segment.
 */
export function parseShortUrl(segments: readonly string[], reserved: ReadonlySet<string>): ShortUrl | null {
  const [first, second, ...rest] = segments
  if (first === undefined || rest.length || reserved.has(first.toLowerCase())) return null

  if (second === undefined || FLAG.test(second)) {
    const page = splitSection(first)
    if (!page || !isManName(page.name)) return null
    const name = page.name.toLowerCase()
    if (second !== undefined) return { kind: 'option', name, section: page.section, flag: second }
    return page.section ? { kind: 'page', name, section: page.section } : { kind: 'name', name }
  }
  if (SECTION.test(first) && splitSection(second)?.section === null && isManName(second)) {
    return { kind: 'page', name: second.toLowerCase(), section: first.toLowerCase() }
  }
  return null
}

export function manPath(name: string, section?: string | null): string {
  const base = `/man/${encodeURIComponent(name)}`
  return section ? `${base}/${encodeURIComponent(section)}` : base
}
