'use client'

import { startTransition, useEffect, useMemo, useRef, useState } from 'react'

import { CheckIcon, CopyIcon } from '../icons'
import { escapeRegExp, getRanges, overlapsAny } from '../../lib/textRanges'

let hljsPromise: Promise<unknown> | null = null

async function loadHljs(): Promise<unknown> {
  if (!hljsPromise) {
    hljsPromise = Promise.all([
      import('highlight.js/lib/core'),
      import('highlight.js/lib/languages/bash'),
      import('highlight.js/lib/languages/c'),
      import('highlight.js/lib/languages/makefile'),
      import('highlight.js/lib/languages/python'),
    ]).then(([core, bash, c, makefile, python]) => {
      core.default.registerLanguage('bash', bash.default)
      core.default.registerLanguage('shell', bash.default)
      core.default.registerLanguage('sh', bash.default)
      core.default.registerLanguage('zsh', bash.default)

      core.default.registerLanguage('c', c.default)
      core.default.registerLanguage('makefile', makefile.default)
      core.default.registerLanguage('python', python.default)
      return core.default
    })
  }

  return hljsPromise
}

type HighlightCtx = {
  findQuery?: string
  optionRegex?: RegExp
}

export function CodeBlock({
  id,
  text,
  languageHint,
  findQuery,
  optionRegex,
}: {
  id?: string | null
  text: string
  languageHint?: string | null
  findQuery?: string
  optionRegex?: RegExp
}) {
  const [copied, setCopied] = useState(false)
  const language = normalizeLanguageHint(languageHint) ?? 'bash'
  const ctx = useMemo((): HighlightCtx => ({ findQuery, optionRegex }), [findQuery, optionRegex])
  const markedText = useMemo(() => buildMarkedText(text, ctx), [ctx, text])
  const fallbackHtml = useMemo(() => applyMarkers(escapeHtml(markedText)), [markedText])
  const [highlighted, setHighlighted] = useState<{ source: string; html: string } | null>(null)
  const timeoutRef = useRef<number | null>(null)

  const allowSyntaxHighlight = shouldHighlight(text) && !ctx.findQuery && !ctx.optionRegex && text.length <= 20_000

  useEffect(() => {
    if (allowSyntaxHighlight) return
    setHighlighted(null)
  }, [allowSyntaxHighlight])

  useEffect(() => {
    return () => {
      if (timeoutRef.current != null) window.clearTimeout(timeoutRef.current)
    }
  }, [])

  useEffect(() => {
    if (!allowSyntaxHighlight) return

    let cancelled = false
    void loadHljs().then((hljs) => {
      if (cancelled) return
      try {
        const next = (hljs as { highlight: (t: string, o: unknown) => { value: string } }).highlight(markedText, {
          language,
          ignoreIllegals: true,
        }).value
        startTransition(() => {
          setHighlighted({ source: markedText, html: applyMarkers(next) })
        })
      } catch {
        // keep fallback
      }
    })

    return () => {
      cancelled = true
    }
  }, [allowSyntaxHighlight, language, markedText, text])

  const html = highlighted?.source === markedText ? highlighted.html : fallbackHtml

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

  const languageLabel = language

  return (
    <div id={id ?? undefined} className="scroll-mt-32">
      <div className="-mx-4 overflow-hidden rounded-none border border-[var(--bm-code-border)] bg-[#0d0d0d] sm:mx-0 sm:rounded-[var(--bm-radius)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--bm-code-border)] px-3 py-2">
          <div className="min-w-0 truncate font-mono text-xs tracking-wide text-[color:var(--bm-code-muted)]">
            {languageLabel}
          </div>
          <button
            type="button"
            className="inline-flex size-8 items-center justify-center rounded-[var(--bm-radius-sm)] border border-transparent text-[color:var(--bm-code-muted)] transition-colors hover:border-[var(--bm-code-border)] hover:text-[color:var(--bm-code-fg)] focus:outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35]"
            onClick={copy}
            aria-label="Copy code block"
            title={copied ? 'Copied' : 'Copy'}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
        </div>

        <pre className="overflow-x-auto p-4 text-[13px] leading-[1.6]" tabIndex={0}>
          <code className={`hljs language-${language}`} dangerouslySetInnerHTML={{ __html: html }} />
        </pre>
      </div>
    </div>
  )
}

function normalizeLanguageHint(hint?: string | null): 'bash' | 'c' | 'makefile' | 'python' | null {
  if (!hint) return null
  const cleaned = hint.trim().toLowerCase()
  if (!cleaned) return null

  if (['bash', 'shell', 'sh', 'zsh', 'console'].includes(cleaned)) return 'bash'
  if (['python', 'py'].includes(cleaned)) return 'python'
  if (['c', 'c99', 'c11', 'cpp', 'c++'].includes(cleaned)) return 'c'
  if (['make', 'makefile'].includes(cleaned)) return 'makefile'

  return null
}

function escapeHtml(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function buildMarkedText(text: string, ctx: HighlightCtx) {
  const findQuery = ctx.findQuery?.trim()
  const hasFind = Boolean(findQuery && findQuery.length >= 2)
  const hasOpt = Boolean(ctx.optionRegex)

  if (!hasFind && !hasOpt) return text

  const findRanges = hasFind ? getRanges(text, new RegExp(escapeRegExp(findQuery!), 'gi')) : []
  const optRanges = hasOpt ? getRanges(text, ctx.optionRegex!) : []
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
    if (m.kind === 'find') out += `__BM_FIND_START__${chunk}__BM_FIND_END__`
    else out += `__BM_OPT_START__${chunk}__BM_OPT_END__`
    cursor = m.end
  }
  if (cursor < text.length) out += text.slice(cursor)
  return out
}

function applyMarkers(html: string) {
  let out = html

  out = out.replaceAll('__BM_OPT_START__', '<mark data-bm-opt class="bm-mark bm-opt">')
  out = out.replaceAll('__BM_OPT_END__', '</mark>')

  out = out.replaceAll('__BM_FIND_START__', '<mark data-bm-find class="bm-mark bm-find">')
  out = out.replaceAll('__BM_FIND_END__', '</mark>')

  return out
}

function shouldHighlight(text: string) {
  // preserve box-drawing diagrams as plain monospace
  if (/[\u2500-\u257F]/.test(text)) return false
  return true
}
