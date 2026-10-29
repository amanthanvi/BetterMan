import type { PageDerivedResponse } from '../../convex/_derivedEncoding'

import type { BlockNode, BriefExample, ManPageBrief, OptionItem } from './docModel'
import type { ExampleSnippet } from './examples'

/**
 * What In brief shows, from data that may be missing: most of the corpus has no
 * summary, no examples or no options yet, so every part is optional and the
 * whole section is omitted when nothing is there (FINAL-DIRECTION fix 5).
 */
export type BriefFlag = { flag: string; anchorId: string; argument: string | null; gloss: string }
export type BriefFlagGroup = { label: string | null; flags: BriefFlag[] }
export type BriefView = {
  summary: string | null
  examples: BriefExample[]
  flagGroups: BriefFlagGroup[]
  generated: ManPageBrief['generated']
}

/**
 * Headings that list mutually exclusive modes: tar's "Operation mode", pacman's
 * "Operations". Only the whole heading counts, and only these, so tar's
 * "Operation modifiers", find's combinable "ACTIONS", gpg's "COMMANDS" (sign and
 * encrypt combine) and systemctl's verbs are not modes. When unsure, not a mode:
 * a missed conflict warning costs less than a false one.
 */
export function isModeHeading(heading: string): boolean {
  return /^(?:(?:main )?operation modes?|modes? of operation|operations)$/i.test(heading.trim().replace(/:$/, ''))
}
const GLOSS_MAX = 80

/** The heading text each definition sits under, keyed by the definition's id. */
export function definitionHeadings(blocks: BlockNode[]): Map<string, string> {
  const out = new Map<string, string>()
  let heading = ''
  const walk = (list: BlockNode[]) => {
    for (const block of list) {
      if (block.type === 'heading') heading = block.text
      else if (block.type === 'definition_list') {
        for (const item of block.items) {
          if (item.id && !out.has(item.id)) out.set(item.id, heading)
          walk(item.definitionBlocks)
        }
      } else if (block.type === 'list') for (const item of block.items) walk(item)
    }
  }
  walk(blocks)
  return out
}

/** The first sentence of a definition, cut to fit one line. */
export function gloss(description: string): string {
  const text = description.replace(/\s+/g, ' ').trim()
  const sentence = /^(.+?[.;:])(?:\s|$)/.exec(text)?.[1]?.replace(/[.;:]$/, '') ?? text
  return sentence.length > GLOSS_MAX ? `${sentence.slice(0, GLOSS_MAX - 1).trimEnd()}…` : sentence
}

/**
 * The most-used flags, only when they are counted from verified examples (a
 * manual-order fallback is not "most used"). When some come from the page's modes
 * and some do not, they are grouped as "One mode · Then add" (fix 3).
 */
export function briefFlagGroups(mostUsed: PageDerivedResponse['mostUsed'] | undefined, options: OptionItem[], blocks: BlockNode[]): BriefFlagGroup[] {
  if (!mostUsed || mostUsed.source !== 'verified-frequency' || !mostUsed.flags.length) return []
  const byAnchor = new Map(options.map((option) => [option.anchorId, option]))
  const headings = definitionHeadings(blocks)
  const flags = mostUsed.flags.map(({ flag, anchorId }) => {
    const option = byAnchor.get(anchorId)
    return { flag, anchorId, argument: option?.argument ?? null, gloss: option ? gloss(option.description) : '', mode: isModeHeading(headings.get(anchorId) ?? '') }
  })
  const strip = ({ mode: _mode, ...flag }: (typeof flags)[number]): BriefFlag => flag
  const modes = flags.filter((f) => f.mode)
  const rest = flags.filter((f) => !f.mode)
  if (modes.length && rest.length) return [{ label: 'One mode', flags: modes.map(strip) }, { label: 'Then add', flags: rest.map(strip) }]
  return [{ label: null, flags: flags.map(strip) }]
}

/** The page's own EXAMPLES, as In brief examples, when the generated layer has none for this page. */
export function pageExamples(snippets: ExampleSnippet[]): BriefExample[] {
  return snippets.map((snippet) => ({ source: 'page' as const, description: snippet.label ?? '', command: snippet.text }))
}

export function briefView(opts: {
  brief: ManPageBrief | null | undefined
  fallbackExamples: ExampleSnippet[]
  mostUsed: PageDerivedResponse['mostUsed'] | undefined
  options: OptionItem[]
  blocks: BlockNode[]
}): BriefView | null {
  const summary = opts.brief?.summary?.trim() || null
  const examples = opts.brief?.examples.length ? opts.brief.examples : pageExamples(opts.fallbackExamples)
  const flagGroups = briefFlagGroups(opts.mostUsed, opts.options, opts.blocks)
  if (!summary && !examples.length && !flagGroups.length) return null
  return { summary, examples, flagGroups, generated: opts.brief?.generated ?? null }
}

/**
 * A command split around its placeholder ranges ([start, end) code-unit offsets),
 * for rendering as text nodes: generated and tldr text is never markup. Invalid or
 * overlapping ranges are ignored.
 */
export function commandSegments(command: string, placeholders: number[][] | undefined): Array<{ text: string; placeholder: boolean }> {
  const ranges = (placeholders ?? [])
    .filter((r): r is [number, number] => r.length === 2 && Number.isInteger(r[0]) && Number.isInteger(r[1]) && r[0]! >= 0 && r[0]! < r[1]! && r[1]! <= command.length)
    .sort((a, b) => a[0] - b[0])
  const out: Array<{ text: string; placeholder: boolean }> = []
  let cursor = 0
  for (const [start, end] of ranges) {
    if (start < cursor) continue
    if (start > cursor) out.push({ text: command.slice(cursor, start), placeholder: false })
    out.push({ text: command.slice(start, end), placeholder: true })
    cursor = end
  }
  if (cursor < command.length || !out.length) out.push({ text: command.slice(cursor), placeholder: false })
  return out
}

const SYSTEM_NAMES = ['GNU/Linux', 'FreeBSD', 'macOS']

/** `?portability=text`: the cells as words, for readers who prefer them to the glyph. */
export function portabilityWords(codes: string): string {
  if (codes === 'aaa') return 'on all three'
  const absent: string[] = []
  const differs: string[] = []
  const unknown: string[] = []
  ;[...codes].forEach((code, i) => {
    const name = SYSTEM_NAMES[i] ?? ''
    if (code === 'x') absent.push(name)
    else if (code === 'd' || code === 'n' || code === 'i') differs.push(name)
    else if (code !== 'a') unknown.push(name)
  })
  const parts: string[] = []
  if (absent.length) parts.push(`not on ${absent.join(' or ')}`)
  if (differs.length) parts.push(`differs on ${differs.join(' and ')}`)
  if (unknown.length) parts.push(`unknown on ${unknown.join(' and ')}`)
  return parts.join('; ')
}
