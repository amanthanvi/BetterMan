'use client'

import Link from 'next/link'
import { useState } from 'react'

import type { ManPageContent } from '../../lib/docModel'
import type { SectionPage } from '../../lib/api'
import type { Distro } from '../../lib/distro'

function withDistro(path: string, distro: Distro): string {
  if (distro === 'debian') return path
  const url = new URL(path, 'https://example.invalid')
  url.searchParams.set('distro', distro)
  return `${url.pathname}${url.search}`
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
  const [showAllRelated, setShowAllRelated] = useState(false)
  const seeAlsoItems = seeAlso ?? []

  return (
    <>
      {seeAlsoItems.length ? (
        <aside className="mt-10">
          <h2 className="font-mono text-xs tracking-wide text-[color:var(--bm-muted)]">See also</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {seeAlsoItems.slice(0, 24).map((ref) => (
              <li key={`${ref.name}:${ref.section ?? ''}`}>
                {ref.section && !ref.resolvedPageId ? (
                  <span
                    className="inline-flex items-center rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-bg)/0.25] px-3 py-1 text-sm text-[color:var(--bm-muted)]"
                    title="Not available in this dataset"
                  >
                    {ref.name}({ref.section})
                  </span>
                ) : ref.section ? (
                  <Link
                    href={withDistro(`/man/${encodeURIComponent(ref.name)}/${encodeURIComponent(ref.section)}`, distro)}
                    className="inline-flex items-center rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] px-3 py-1 text-sm hover:bg-[color:var(--bm-surface)/0.9]"
                  >
                    {ref.name}({ref.section})
                  </Link>
                ) : (
                  <Link
                    href={withDistro(`/man/${encodeURIComponent(ref.name)}`, distro)}
                    className="inline-flex items-center rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] px-3 py-1 text-sm hover:bg-[color:var(--bm-surface)/0.9]"
                  >
                    {ref.name}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </aside>
      ) : null}

      {relatedItems.length ? (
        <aside className="mt-10">
          <h2 className="font-mono text-xs tracking-wide text-[color:var(--bm-muted)]">Related</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {(showAllRelated ? relatedItems : relatedItems.slice(0, 5)).map((item) => (
              <li key={`${item.name}:${item.section}`}>
                <Link
                  href={withDistro(`/man/${encodeURIComponent(item.name)}/${encodeURIComponent(item.section)}`, distro)}
                  className="inline-flex items-center rounded-full border border-[var(--bm-border)] bg-[color:var(--bm-surface)/0.75] px-3 py-1 text-sm hover:bg-[color:var(--bm-surface)/0.9]"
                >
                  {item.name}({item.section})
                </Link>
              </li>
            ))}
          </ul>
          {relatedItems.length > 5 ? (
            <div className="mt-3">
              <button
                type="button"
                className="text-sm underline underline-offset-4"
                onClick={() => setShowAllRelated((v) => !v)}
              >
                {showAllRelated ? 'Show fewer' : `Show all (${relatedItems.length})`}
              </button>
            </div>
          ) : null}
        </aside>
      ) : null}
    </>
  )
}

