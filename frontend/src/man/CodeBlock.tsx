import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'

let hljsPromise: Promise<unknown> | null = null

async function loadHljs(): Promise<unknown> {
  if (!hljsPromise) {
    hljsPromise = Promise.all([
      import('highlight.js/lib/core'),
      import('highlight.js/lib/languages/bash'),
    ]).then(([core, bash]) => {
      core.default.registerLanguage('bash', bash.default)
      return core.default
    })
  }

  return hljsPromise
}

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
  const [html, setHtml] = useState(() => applyMarkers(escapeHtml(buildMarkedText(text, { findQuery, optionRegex }))))
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current != null) window.clearTimeout(timeoutRef.current)
    }
  }, [])

  useEffect(() => {
    const markedText = buildMarkedText(text, { findQuery, optionRegex })
    const fallback = applyMarkers(escapeHtml(markedText))
    setHtml(fallback)

    if (!shouldHighlight(text)) return

    let cancelled = false
    void loadHljs().then((hljs) => {
      if (cancelled) return
      try {
        const next = (hljs as { highlight: (t: string, o: unknown) => { value: string } }).highlight(markedText, {
          language: 'bash',
          ignoreIllegals: true,
        }).value
        setHtml(applyMarkers(next))
      } catch {
        // keep fallback
      }
    })

    return () => {
      cancelled = true
    }
  }, [findQuery, optionRegex, text])

  const highlightedNodes = useMemo(() => highlightedHtmlToReact(html), [html])

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
    <div id={id ?? undefined} className="relative scroll-mt-32">
      <button
        type="button"
        className="absolute right-3 top-3 rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.85] p-2 text-[color:var(--bm-muted)] shadow-sm hover:bg-[color:var(--bm-surface)]"
        onClick={copy}
        aria-label="Copy code block"
        title={copied ? 'Copied' : 'Copy'}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
      <pre className="overflow-x-auto rounded-2xl border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.35] p-5 text-sm leading-7 shadow-sm">
        <code className="hljs language-bash">{highlightedNodes}</code>
      </pre>
    </div>
  )
}

function highlightedHtmlToReact(html: string): ReactNode[] {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const container = doc.body.firstElementChild
  if (!container) return [html]
  return Array.from(container.childNodes).map((n, idx) => nodeToReact(n, `r:${idx}`))
}

function nodeToReact(node: ChildNode, key: string): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  if (node.nodeType !== Node.ELEMENT_NODE) return ''

  const el = node as HTMLElement
  const children = Array.from(el.childNodes).map((c, idx) => nodeToReact(c, `${key}:${idx}`))

  if (el.tagName === 'SPAN') {
    const className = filterClasses(el.className, (c) => c === 'hljs' || c.startsWith('hljs-'))
    return (
      <span key={key} className={className || undefined}>
        {children}
      </span>
    )
  }

  if (el.tagName === 'MARK') {
    const className = filterClasses(
      el.className,
      (c) => c === 'bm-mark' || c === 'bm-find' || c === 'bm-opt' || c === 'bm-find-active',
    )
    const attrs: { 'data-bm-find'?: ''; 'data-bm-opt'?: '' } = {}
    if (el.hasAttribute('data-bm-find')) attrs['data-bm-find'] = ''
    if (el.hasAttribute('data-bm-opt')) attrs['data-bm-opt'] = ''

    return (
      <mark key={key} className={className || undefined} {...attrs}>
        {children}
      </mark>
    )
  }

  return <span key={key}>{el.textContent ?? ''}</span>
}

function filterClasses(raw: string, allow: (cls: string) => boolean) {
  const classes = raw.split(/\s+/).map((c) => c.trim()).filter(Boolean)
  return classes.filter(allow).join(' ')
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
