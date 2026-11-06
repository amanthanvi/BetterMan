import Link from 'next/link'
import type { ReactNode } from 'react'

import type { SearchResult, TopHit as TopHitData } from '../../lib/api'
import { manPageHref, type Distro } from '../../lib/distro'
import type { Lang } from '../../lib/i18n/locales'
import type { ClientT } from '../../lib/i18n/server'
import { escapeRegExp } from '../../lib/textRanges'
import { LinkPendingHint } from '../ui/LinkPendingHint'
import { resultKind as kindOf } from './resultKind'
import { TopHit } from './TopHit'

const BACKEND_HIGHLIGHT_MARKER_RE = /[⟪⟫]/g

function clean(text: string): string {
  return text.replace(BACKEND_HIGHLIGHT_MARKER_RE, '').replace(/\s+/g, ' ').trim()
}

export function highlight(text: string, query: string): ReactNode[] {
  const q = query.trim()
  const cleanedText = clean(text)
  if (q.length < 2) return [cleanedText]
  const re = new RegExp(escapeRegExp(q), 'gi')
  const out: ReactNode[] = []
  let last = 0
  while (true) {
    const m = re.exec(cleanedText)
    if (!m || m.index == null) break
    const start = m.index
    const end = start + m[0].length
    if (start > last) out.push(cleanedText.slice(last, start))
    out.push(
      <mark key={start} className="bm-mark bm-find">
        {cleanedText.slice(start, end)}
      </mark>,
    )
    last = end
    if (!m[0].length) re.lastIndex += 1
  }
  if (last < cleanedText.length) out.push(cleanedText.slice(last))
  return out.length ? out : [cleanedText]
}

/** Small-caps kind label (fix 15): a task or flag match, a symbol's kind, or what the section documents. */
export function resultKind(r: SearchResult, t: ClientT): string {
  return kindOf(r, t)
}

/** One line of evidence for why this hit matched: the task phrase, the flags, or the defined term. */
function Evidence({ r, q, t }: { r: SearchResult; q: string; t: ClientT }) {
  const lines = (r.highlights ?? []).map(clean).filter(Boolean)
  if (r.match === 'task' && r.taskPhrase) {
    return (
      <p className="mt-0.5 truncate text-sm text-ink-2">
        {t('Task match: “{phrase}”', { phrase: r.taskPhrase })} <span className="text-xs text-ink-3">· {t('generated')}</span>
      </p>
    )
  }
  if (r.match === 'option' && lines.length) {
    return (
      <p className="mt-0.5 truncate font-mono text-sm text-ink-2">
        {lines.map((line, index) => (
          <span key={index}>
            {index ? <span className="font-sans text-ink-3"> · </span> : null}
            {highlight(line, q)}
          </span>
        ))}
      </p>
    )
  }
  if (r.symbolKind && lines.length) {
    const [term, ...rest] = lines
    return (
      <p className="mt-0.5 truncate text-sm text-ink-2">
        <code className="font-mono font-semibold text-ink">{term}</code>
        {rest.length ? <> {rest.join(' ')}</> : null}
      </p>
    )
  }
  // A page hit matched its name or NAME description, which the title line already shows.
  return null
}

export function ResultRow({ r, q, urlDistro, urlLang, top, t }: { r: SearchResult; q: string; urlDistro: Distro | null; urlLang: Lang | null; top?: TopHitData | null; t: ClientT }) {
  // A translated hit (#395) opens its language's page, even before that language's UI is public.
  const href = manPageHref(r.name, r.section, urlDistro, r.anchorId, (r.locale as Lang | undefined) ?? urlLang)
  return (
    <li className="grid gap-x-4 gap-y-0.5 border-t border-rule py-3.5 sm:grid-cols-[6.5rem_minmax(0,1fr)]">
      <span className="small-caps text-[0.9375rem] leading-[1.6] text-ink-3">{resultKind(r, t)}</span>
      <div className="min-w-0">
        <p className="font-serif text-[1.125rem] leading-[1.45]">
          <Link href={href} className="no-underline hover:text-accent" aria-label={`${r.name}(${r.section})`} title={`${r.name}(${r.section})`}>
            <b className="font-semibold">{r.name}</b>({r.section})
            <LinkPendingHint />
          </Link>{' '}
          <span className="text-ink-2">{highlight(r.description, q)}</span>
        </p>
        <Evidence r={r} q={q} t={t} />
        {top ? <TopHit top={top} urlDistro={urlDistro} urlLang={urlLang} t={t} /> : null}
      </div>
    </li>
  )
}
