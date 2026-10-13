import Link from 'next/link'

import { DISTRO_LABEL, normalizeDistro } from '../../lib/distro'
import type { ManPage } from '../../lib/docModel'
import type { DiffEntry, ManDiff } from '../../lib/manDiff'
import { ManSectionLabel, RunningHead, sectionLabel } from './RunningHead'

function distroLabel(distro: string): string {
  const normalized = normalizeDistro(distro)
  return normalized ? DISTRO_LABEL[normalized] : distro
}

function DiffLine({ sign, text }: { sign: '+' | '-'; text: string }) {
  return (
    <div className={`grid grid-cols-[1.5ch_minmax(0,1fr)] gap-x-3 ${sign === '+' ? 'font-medium text-fg' : 'text-muted'}`}>
      <span aria-hidden="true" className="font-mono">{sign}</span>
      <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
        <span className="sr-only">{sign === '+' ? 'Added: ' : 'Removed: '}</span>{text}
      </span>
    </div>
  )
}

function DiffSection({ title, entries }: { title: string; entries: DiffEntry[] }) {
  if (!entries.length) return null
  return (
    <section className="mt-8" aria-label={title}>
      <ManSectionLabel as="h2">{title}</ManSectionLabel>
      <ul className="mt-3 space-y-5 pl-6 sm:pl-8">
        {entries.map((entry, index) => (
          <li key={index}>
            <div className="mb-1 font-mono text-xs text-faint">
              {entry.area} · {entry.type.replaceAll('_', ' ')}
            </div>
            {entry.before !== undefined ? <DiffLine sign="-" text={entry.before} /> : null}
            {entry.after !== undefined ? <DiffLine sign="+" text={entry.after} /> : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function ManPageDiff({ page, targetDistro, backHref, diff, message }: {
  page: Pick<ManPage, 'name' | 'section' | 'distro'>
  targetDistro?: string
  backHref: string
  diff?: ManDiff
  message?: string
}) {
  const identical = diff && !diff.added.length && !diff.removed.length && !diff.changed.length
  return (
    <article data-bm-man-diff className="mx-auto w-full max-w-[var(--bm-reading-column-width)]">
      <RunningHead title={`${page.name.toUpperCase()}(${page.section})`} label={sectionLabel(page.section)} />
      <header className="mt-8">
        <h1 className="break-words font-mono text-2xl font-semibold leading-tight tracking-tight">
          {page.name}<span className="text-muted">({page.section})</span>
        </h1>
        {targetDistro ? (
          <p className="mt-3 font-mono text-xs text-muted">
            Comparing {distroLabel(page.distro)} → {distroLabel(targetDistro)}
          </p>
        ) : null}
        <Link href={backHref} className="mt-3 inline-block font-mono text-xs underline decoration-edge-strong underline-offset-4 hover:decoration-accent">
          Back to man page
        </Link>
      </header>
      {message || identical ? <p className="mt-8 text-sm text-muted">{message ?? 'These distribution variants are identical.'}</p> : null}
      {diff ? (
        <div className="mt-8 [font-family:var(--bm-reading-font-family)] [font-size:var(--bm-reading-font-size)] leading-[var(--bm-reading-line-height)]">
          <DiffSection title="Added" entries={diff.added} />
          <DiffSection title="Removed" entries={diff.removed} />
          <DiffSection title="Changed" entries={diff.changed} />
        </div>
      ) : null}
    </article>
  )
}
