'use client'

import Link from 'next/link'

import type { ManPageContent } from '../../lib/docModel'
import type { SectionPage } from '../../lib/api'
import { withDistro, type Distro } from '../../lib/distro'
import { LinkPendingHint } from '../ui/LinkPendingHint'

export function ManPageFooterSections({
  reportHref,
  urlDistro,
  seeAlso,
  relatedItems,
  hasParseWarnings = false,
}: {
  reportHref: string
  urlDistro: Distro | null
  seeAlso?: ManPageContent['seeAlso']
  relatedItems: SectionPage[]
  hasParseWarnings?: boolean
}) {
  const seeAlsoItems = (seeAlso ?? []).slice(0, 24)
  const related = relatedItems.slice(0, 24)

  const hasAddendum = seeAlsoItems.length > 0 || related.length > 0

  return (
    <>
      {/* BetterMan's addendum: the manual's cross-references as links, and pages that sit near this one. */}
      {hasAddendum ? (
        <div className="bm-added mt-14 px-5 py-4 text-sm max-md:-mx-5 md:px-8 md:py-5">
          {seeAlsoItems.length ? (
            <aside className={ROW} aria-label="See also">
              <h2 className={LABEL}>See also</h2>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 font-serif text-base">
                {seeAlsoItems.map((ref) => {
                  const key = `${ref.name}:${ref.section ?? ''}`

                  if (ref.section && !ref.resolvedPageId) {
                    return (
                      <li key={key} className="text-ink-3" title="Not available in this dataset">
                        {ref.name}({ref.section})<span className="sr-only"> (not available)</span>
                      </li>
                    )
                  }

                  const href = ref.section
                    ? withDistro(`/man/${encodeURIComponent(ref.name)}/${encodeURIComponent(ref.section)}`, urlDistro)
                    : withDistro(`/man/${encodeURIComponent(ref.name)}`, urlDistro)

                  return (
                    <li key={key}>
                      <Link href={href} className="underline">
                        <b className="font-semibold">{ref.name}</b>
                        {ref.section ? `(${ref.section})` : null}
                        <LinkPendingHint />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </aside>
          ) : null}

          {related.length ? (
            <aside className={ROW} aria-label="Related commands">
              <h2 className={LABEL}>Related</h2>
              <ul className="grid gap-y-1 sm:grid-cols-2 sm:gap-x-6">
                {related.map((item) => (
                  <li key={`${item.name}:${item.section}`} className="min-w-0 truncate">
                    <Link
                      href={withDistro(`/man/${encodeURIComponent(item.name)}/${encodeURIComponent(item.section)}`, urlDistro)}
                      className="no-underline"
                    >
                      <span className="font-serif text-base">
                        <b className="font-semibold">{item.name}</b>({item.section})
                      </span>{' '}
                      <span className="text-ink-2">{item.description}</span>
                      <LinkPendingHint />
                    </Link>
                  </li>
                ))}
              </ul>
            </aside>
          ) : null}
        </div>
      ) : null}

      <div className="mt-8 space-y-1 text-xs text-ink-3">
        {hasParseWarnings ? <p>mandoc reported formatting warnings for this page. Some structure may be lost.</p> : null}
        <p>
          <a href={reportHref} target="_blank" rel="noopener noreferrer" className="underline">
            Report a problem
          </a>{' '}
          with this page on GitHub.
        </p>
      </div>
    </>
  )
}

const ROW = 'grid gap-x-4 gap-y-1 py-1.5 sm:grid-cols-[7.5rem_minmax(0,1fr)]'
const LABEL = 'pt-0.5 text-sm font-normal text-ink-3'
