export type ShortUrl =
  | { kind: 'name'; name: string }
  | { kind: 'page'; name: string; section: string }
  | { kind: 'option'; name: string; section: string | null; flag: string }

const NAME = /^[a-z0-9_+[][\w.+:@[\]-]{0,199}$/i
// A digit, then letters: `1`, `3p`, `1ssl`. `python3.11` stays a name.
const SECTION = /^\d[a-z]{0,9}$/i
const FLAG = /^--?[^\s/-][^\s/]{0,79}$/

function splitSection(segment: string): { name: string; section: string | null } {
  const dot = segment.lastIndexOf('.')
  const section = segment.slice(dot + 1)
  if (dot > 0 && SECTION.test(section)) return { name: segment.slice(0, dot), section: section.toLowerCase() }
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
    const { name, section } = splitSection(first)
    if (!NAME.test(name)) return null
    const lowered = name.toLowerCase()
    if (second !== undefined) return { kind: 'option', name: lowered, section, flag: second }
    return section ? { kind: 'page', name: lowered, section } : { kind: 'name', name: lowered }
  }
  if (SECTION.test(first) && NAME.test(second)) {
    return { kind: 'page', name: second.toLowerCase(), section: first.toLowerCase() }
  }
  return null
}

export function manPath(name: string, section?: string | null): string {
  const base = `/man/${encodeURIComponent(name)}`
  return section ? `${base}/${encodeURIComponent(section)}` : base
}
