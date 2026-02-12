'use client'

import Link from 'next/link'

import type { ManPageContent } from '../../lib/docModel'
import type { SectionPage } from '../../lib/api'
import type { Distro } from '../../lib/distro'
import { withDistro } from '../../lib/distro'

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] p-3 transition-colors group-hover:border-[var(--bm-border-accent)]">
      {children}
    </div>
  )
}

export function ManPageFooterSections({
  distro,
  seeAlso,
  relatedItems,
}: {
  distro: Distro
  seeAlso?: ManPageContent['seeAlso']
  relatedItems: SectionPage[]
}) {
  const seeAlsoItems = (seeAlso ?? []).slice(0, 24)
  const related = relatedItems.slice(0, 24)

  return (
    <>
      {seeAlsoItems.length ? (
        <aside className="mt-12" aria-label="See also">
          <h2 className="font-mono text-xs tracking-wide text-[color:var(--bm-muted)]">See also</h2>
          <div className="mt-3 overflow-x-auto pb-2">
            <ul className="flex gap-3">
              {seeAlsoItems.map((ref) => {
                const key = `${ref.name}:${ref.section ?? ''}`
                const title = ref.section ? `${ref.name}(${ref.section})` : ref.name

                if (ref.section && !ref.resolvedPageId) {
                  return (
                    <li key={key} className="w-[min(18rem,80vw)] shrink-0">
                      <div className="rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] p-3 opacity-70" aria-disabled="true">
                        <div className="font-mono text-sm font-semibold text-[color:var(--bm-fg)]">{title}</div>
                        <div className="mt-1 text-sm text-[color:var(--bm-muted)]">Not available in this dataset</div>
                        <span className="sr-only"> (not available)</span>
                      </div>
                    </li>
                  )
                }

                const href = ref.section
                  ? withDistro(`/man/${encodeURIComponent(ref.name)}/${encodeURIComponent(ref.section)}`, distro)
                  : withDistro(`/man/${encodeURIComponent(ref.name)}`, distro)

                return (
                  <li key={key} className="w-[min(18rem,80vw)] shrink-0">
                    <Link href={href} className="group block h-full focus:outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35]">
                      <CardShell>
                        <div className="font-mono text-sm font-semibold text-[color:var(--bm-fg)]">{title}</div>
                      </CardShell>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        </aside>
      ) : null}

      {related.length ? (
        <aside className="mt-12" aria-label="Related commands">
          <h2 className="font-mono text-xs tracking-wide text-[color:var(--bm-muted)]">Related</h2>
          <div className="mt-3 overflow-x-auto pb-2">
            <ul className="flex gap-3">
              {related.map((item) => (
                <li key={`${item.name}:${item.section}`} className="w-[min(18rem,80vw)] shrink-0">
                  <Link
                    href={withDistro(`/man/${encodeURIComponent(item.name)}/${encodeURIComponent(item.section)}`, distro)}
                    className="group block h-full focus:outline-none focus:ring-2 focus:ring-[color:var(--bm-accent)/0.35]"
                  >
                    <CardShell>
                      <div className="font-mono text-sm font-semibold text-[color:var(--bm-fg)]">
                        {item.name}({item.section})
                      </div>
                      <div className="mt-1 truncate text-sm text-[color:var(--bm-muted)]">{item.description}</div>
                    </CardShell>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      ) : null}
    </>
  )
}
