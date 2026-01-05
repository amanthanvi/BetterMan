import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import { useEffect, useMemo, useRef, useState } from 'react'

hljs.registerLanguage('bash', bash)

export function CodeBlock({
  id,
  text,
  findQuery,
  optionRegex,
}: {
  id?: string | null
  text: string
  findQuery?: string
  optionRegex?: RegExp
}) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current != null) window.clearTimeout(timeoutRef.current)
    }
  }, [])

  const highlighted = useMemo(() => {
    const markedText = buildMarkedText(text, { findQuery, optionRegex })
    const fallback = applyMarkers(escapeHtml(markedText))
    if (!shouldHighlight(text)) return fallback
    try {
      const html = hljs.highlight(markedText, { language: 'bash', ignoreIllegals: true }).value
      return applyMarkers(html)
    } catch {
      return fallback
    }
  }, [findQuery, optionRegex, text])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      if (timeoutRef.current != null) window.clearTimeout(timeoutRef.current)
      timeoutRef.current = window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  return (
    <div id={id ?? undefined} className="relative scroll-mt-24">
      <button
        type="button"
        className="absolute right-2 top-2 rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] p-1.5 text-[color:var(--bm-muted)] hover:bg-[color:var(--bm-surface)/0.8]"
        onClick={copy}
        aria-label="Copy code block"
        title={copied ? 'Copied' : 'Copy'}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
      <pre className="overflow-x-auto rounded-lg border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.6] p-4 text-sm leading-6">
        <code className="hljs language-bash" dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>
    </div>
  )
}

function escapeHtml(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function buildMarkedText(
  text: string,
  opts: { findQuery?: string; optionRegex?: RegExp },
) {
  const findQuery = opts.findQuery?.trim()
  const hasFind = Boolean(findQuery && findQuery.length >= 2)
  const hasOpt = Boolean(opts.optionRegex)

  if (!hasFind && !hasOpt) return text

  const findRanges = hasFind ? getRanges(text, new RegExp(escapeRegExp(findQuery!), 'gi')) : []
  const optRanges = hasOpt ? getRanges(text, opts.optionRegex!) : []
  const optFiltered = optRanges.filter((r) => !overlapsAny(r, findRanges))

  const merged = [
    ...findRanges.map((r) => ({ ...r, kind: 'find' as const })),
    ...optFiltered.map((r) => ({ ...r, kind: 'opt' as const })),
  ].sort((a, b) => a.start - b.start)

  if (!merged.length) return text

  let out = ''
  let cursor = 0
  for (const m of merged) {
    if (m.start > cursor) out += text.slice(cursor, m.start)
    const chunk = text.slice(m.start, m.end)
    if (m.kind === 'find') {
      out += `__BM_FIND_START__${chunk}__BM_FIND_END__`
    } else {
      out += `__BM_OPT_START__${chunk}__BM_OPT_END__`
    }
    cursor = m.end
  }
  if (cursor < text.length) out += text.slice(cursor)
  return out
}

function applyMarkers(html: string) {
  let out = html

  out = out.replaceAll(
    '__BM_OPT_START__',
    '<mark data-bm-opt class="bm-mark bm-opt">',
  )
  out = out.replaceAll('__BM_OPT_END__', '</mark>')

  out = out.replaceAll('__BM_FIND_START__', '<mark data-bm-find class="bm-mark bm-find">')
  out = out.replaceAll('__BM_FIND_END__', '</mark>')

  return out
}

function overlapsAny(a: { start: number; end: number }, ranges: Array<{ start: number; end: number }>) {
  return ranges.some((b) => a.start < b.end && b.start < a.end)
}

function getRanges(text: string, regex: RegExp) {
  const ranges: Array<{ start: number; end: number }> = []
  regex.lastIndex = 0
  while (true) {
    const m = regex.exec(text)
    if (!m || m.index == null) break
    const start = m.index
    const end = start + m[0].length
    if (end > start) ranges.push({ start, end })
    if (!m[0].length) regex.lastIndex += 1
  }
  return ranges
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function shouldHighlight(text: string) {
  // preserve box-drawing diagrams as plain monospace
  if (/[\u2500-\u257F]/.test(text)) return false
  return true
}

function CopyIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}
