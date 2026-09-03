'use client'

import Link from 'next/link'

import type { ManPageContent } from '../../lib/docModel'
import type { SectionPage } from '../../lib/api'
import type { Distro } from '../../lib/distro'
import { withDistro } from '../../lib/distro'
import { ManSectionLabel } from './RunningHead'

export function ManPageFooterSections({
  distro,
  seeAlso,
  relatedItems,
  relatedLoading = false,
  hasParseWarnings = false,
}: {
  distro: Distro
  seeAlso?: ManPageContent['seeAlso']
  relatedItems: SectionPage[]
  relatedLoading?: boolean
  hasParseWarnings?: boolean
}) {
  const seeAlsoItems = (seeAlso ?? []).slice(0, 24)
  const related = relatedItems.slice(0, 24)

  return (
    <>
      {seeAlsoItems.length ? (
        <aside className="mt-12 border-t border-edge pt-6" aria-label="See also">
          <ManSectionLabel as="h2">SEE ALSO</ManSectionLabel>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            {seeAlsoItems.map((ref) => {
              const key = `${ref.name}:${ref.section ?? ''}`
              const title = ref.section ? `${ref.name}(${ref.section})` : ref.name

              if (ref.section && !ref.resolvedPageId) {
                return (
                  <li key={key}>
                    <span className="font-mono text-sm text-faint" title="Not available in this dataset">
                      {title}
                    </span>
                    <span className="sr-only"> (not available)</span>
                  </li>
                )
              }

              const href = ref.section
                ? withDistro(`/man/${encodeURIComponent(ref.name)}/${encodeURIComponent(ref.section)}`, distro)
                : withDistro(`/man/${encodeURIComponent(ref.name)}`, distro)

              return (
                <li key={key}>
                  <Link href={href} className="font-mono text-sm">
                    {title}
                  </Link>
                </li>
              )
            })}
          </ul>
        </aside>
      ) : null}

      {related.length ? (
        <aside className="mt-10 border-t border-edge pt-6" aria-label="Related commands">
          <ManSectionLabel as="h2">RELATED</ManSectionLabel>
          <ul className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {related.map((item) => (
              <li key={`${item.name}:${item.section}`}>
                <Link
                  href={withDistro(`/man/${encodeURIComponent(item.name)}/${encodeURIComponent(item.section)}`, distro)}
                  className="group flex items-baseline gap-3 py-1.5 transition-colors hover:no-underline"
                >
                  <span className="shrink-0 font-mono text-sm text-accent group-hover:underline group-hover:underline-offset-4">
                    {item.name}({item.section})
                  </span>
                  <span className="min-w-0 truncate text-sm text-muted">{item.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      ) : relatedLoading ? (
        <aside className="mt-10 border-t border-edge pt-6" aria-label="Related commands">
          <ManSectionLabel as="h2">RELATED</ManSectionLabel>
          <p className="mt-3 text-sm text-muted" aria-live="polite">
            Loading related commands…
          </p>
        </aside>
      ) : null}

      {hasParseWarnings ? (
        <p className="mt-10 border-t border-edge pt-4 font-mono text-xs text-faint">
          mandoc reported formatting warnings for this page. Some structure may be lost.
        </p>
      ) : null}
    </>
  )
}
