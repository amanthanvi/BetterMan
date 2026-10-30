import { getRanges, overlapsAny } from '../lib/textRanges'

/**
 * Find and option highlighting over the server-rendered manual. DocRenderer
 * used to render these marks; the HTML is now the same for every reader, so they
 * are applied to its text nodes here. Find matches win over option marks where
 * they overlap, and both stay within one text run, as before.
 */
export type MarkSpec = { find?: RegExp; option?: RegExp }
export type Segment = { text: string; kind?: 'find' | 'opt' }

/** Splits `text` into plain and marked runs. Pure, so it is tested without a DOM. */
export function markSegments(text: string, spec: MarkSpec): Segment[] {
  const find = spec.find ? getRanges(text, spec.find) : []
  const option = spec.option ? getRanges(text, spec.option).filter((r) => !overlapsAny(r, find)) : []
  const marks = [...find.map((r) => ({ ...r, kind: 'find' as const })), ...option.map((r) => ({ ...r, kind: 'opt' as const }))].sort(
    (a, b) => a.start - b.start,
  )
  if (!marks.length) return [{ text }]
  const out: Segment[] = []
  let cursor = 0
  for (const mark of marks) {
    if (mark.start > cursor) out.push({ text: text.slice(cursor, mark.start) })
    out.push({ text: text.slice(mark.start, mark.end), kind: mark.kind })
    cursor = mark.end
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor) })
  return out
}

const MARK_SELECTOR = 'mark[data-bm-find], mark[data-bm-opt]'
// Highlighter markup set aside while a code block shows plain text with marks.
const highlighted = new WeakMap<Element, string>()

function clear(root: Element) {
  const parents = new Set<Node>()
  for (const mark of root.querySelectorAll(MARK_SELECTOR)) {
    const parent = mark.parentNode
    if (!parent) continue
    parent.replaceChild(document.createTextNode(mark.textContent ?? ''), mark)
    parents.add(parent)
  }
  for (const parent of parents) parent.normalize()
}

function setCodeHighlighting(root: Element, on: boolean) {
  for (const code of root.querySelectorAll('.bm-code code')) {
    const saved = highlighted.get(code)
    if (on && saved !== undefined) {
      code.innerHTML = saved
      highlighted.delete(code)
    } else if (!on && saved === undefined) {
      highlighted.set(code, code.innerHTML)
      // The highlighter's spans would split a match; mark the plain text, as the React renderer did.
      code.textContent = code.textContent ?? ''
    }
  }
}

/** Re-marks `root` from scratch. With an empty spec it restores the plain, highlighted manual. */
export function applyMarks(root: Element, spec: MarkSpec) {
  clear(root)
  const active = Boolean(spec.find || spec.option)
  setCodeHighlighting(root, !active)
  if (!active) return

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.parentElement?.closest('.bm-copy, script, style') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  })
  const nodes: Text[] = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text)

  for (const node of nodes) {
    const segments = markSegments(node.data, spec)
    if (segments.length === 1 && !segments[0]!.kind) continue
    const fragment = document.createDocumentFragment()
    for (const segment of segments) {
      if (!segment.kind) {
        fragment.append(segment.text)
        continue
      }
      const mark = document.createElement('mark')
      mark.setAttribute(segment.kind === 'find' ? 'data-bm-find' : 'data-bm-opt', '')
      mark.className = `bm-mark ${segment.kind === 'find' ? 'bm-find' : 'bm-opt'}`
      mark.textContent = segment.text
      fragment.append(mark)
    }
    node.replaceWith(fragment)
  }
}
