import { escapeRegExp, getRanges, overlapsAny, type TextRange } from './textRanges'

/** One logical match may span several inline or syntax-highlight elements. */
export type DocFindMatch = HTMLElement[]

type TextPart = { node: Text; start: number; end: number }
type TextRun = { text: string; parts: TextPart[] }
type HighlightRange = TextRange & { kind: 'find' | 'opt'; match?: DocFindMatch }
type Restoration = { node: Text; text: string; prefix: string; inserted: Node[] }

const restorations = new WeakMap<HTMLElement, Restoration[]>()
const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT', 'FIGCAPTION', 'FIGURE',
  'FOOTER', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL',
  'P', 'PRE', 'SECTION', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'UL',
])
const SKIP_SELECTOR = 'button, input, select, textarea, script, style, svg, [aria-hidden="true"], [hidden], [inert], .sr-only'

/** Restore original text nodes, preserving the nodes React originally rendered. */
export function clearDocHighlights(root: HTMLElement): void {
  for (const { node, text, prefix, inserted } of restorations.get(root) ?? []) {
    if (!root.contains(node)) continue
    for (const added of inserted) added.parentNode?.removeChild(added)
    // A character-data update from the renderer takes precedence over our snapshot.
    if (node.data === prefix) node.data = text
  }
  restorations.delete(root)
}

/**
 * Highlight rendered text without flattening inline markup or copying DOM text
 * into HTML. Find wins over overlapping option terms. Call again after content
 * replacement; it clears its own previous marks before indexing the new DOM.
 */
export function applyDocHighlights(
  root: HTMLElement,
  { findQuery, optionTerms = [] }: { findQuery?: string; optionTerms?: readonly string[] } = {},
): DocFindMatch[] {
  clearDocHighlights(root)
  const query = findQuery?.trim()
  const findRegex = query && query.length >= 2 ? new RegExp(escapeRegExp(query), 'gi') : undefined
  const terms = [...new Set(optionTerms.map((term) => term.trim()).filter(Boolean))]
    .sort((a, b) => b.length - a.length || a.localeCompare(b))
  const optionRegex = terms.length ? new RegExp(terms.map(escapeRegExp).join('|'), 'g') : undefined
  if (!findRegex && !optionRegex) return []

  const matches: DocFindMatch[] = []
  const restored: Restoration[] = []
  for (const run of collectTextRuns(root)) {
    const findRanges = findRegex ? getRanges(run.text, findRegex) : []
    const optionRanges = optionRegex ? getRanges(run.text, optionRegex) : []
    const ranges: HighlightRange[] = [
      ...findRanges.map((range): HighlightRange => {
        const match: DocFindMatch = []
        matches.push(match)
        return { ...range, kind: 'find', match }
      }),
      ...optionRanges.filter((range) => !overlapsAny(range, findRanges))
        .map((range): HighlightRange => ({ ...range, kind: 'opt' })),
    ].sort((a, b) => a.start - b.start)

    let rangeIndex = 0
    for (const part of run.parts) {
      while (ranges[rangeIndex] && ranges[rangeIndex]!.end <= part.start) rangeIndex += 1
      const local: HighlightRange[] = []
      for (let index = rangeIndex; ranges[index] && ranges[index]!.start < part.end; index += 1) {
        const range = ranges[index]!
        local.push({ ...range, start: Math.max(0, range.start - part.start), end: Math.min(part.end, range.end) - part.start })
      }
      if (!local.length) continue
      const text = part.node.data
      const prefix = text.slice(0, local[0]!.start)
      const fragment = root.ownerDocument.createDocumentFragment()
      const inserted: Node[] = []
      let cursor = local[0]!.start
      for (const range of local) {
        if (cursor < range.start) fragment.append(root.ownerDocument.createTextNode(text.slice(cursor, range.start)))
        const mark = root.ownerDocument.createElement('mark')
        mark.setAttribute(range.kind === 'find' ? 'data-bm-find' : 'data-bm-opt', '')
        mark.className = `bm-mark bm-${range.kind}`
        mark.textContent = text.slice(range.start, range.end)
        range.match?.push(mark)
        fragment.append(mark)
        cursor = range.end
      }
      if (cursor < text.length) fragment.append(root.ownerDocument.createTextNode(text.slice(cursor)))
      inserted.push(...fragment.childNodes)
      part.node.data = prefix
      part.node.parentNode!.insertBefore(fragment, part.node.nextSibling)
      restored.push({ node: part.node, text, prefix, inserted })
    }
  }
  restorations.set(root, restored)
  return matches
}

function collectTextRuns(root: HTMLElement): TextRun[] {
  const runs: TextRun[] = []
  let current: TextRun = { text: '', parts: [] }
  const flush = () => {
    if (current.parts.length) runs.push(current)
    current = { text: '', parts: [] }
  }
  const visit = (node: Node) => {
    if (node.nodeType === 3) {
      const text = node as Text
      if (!text.data) return
      const start = current.text.length
      current.text += text.data
      current.parts.push({ node: text, start, end: current.text.length })
      return
    }
    if (node.nodeType !== 1) return
    const element = node as HTMLElement
    if (element.matches(SKIP_SELECTOR) || element.tagName === 'BR') {
      flush()
      return
    }
    const boundary = BLOCK_TAGS.has(element.tagName) || element.hasAttribute('data-bm-block')
    if (boundary) flush()
    for (const child of element.childNodes) visit(child)
    if (boundary) flush()
  }
  visit(root)
  flush()
  return runs
}
