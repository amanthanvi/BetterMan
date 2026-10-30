import { Fragment } from 'react'

import type { PageDerivedResponse } from '../../../convex/_derivedEncoding'
import type { ConceptLink } from '../../lib/concepts'
import type { ManPageContent } from '../../lib/docModel'
import type { SectionPage } from '../../lib/api'
import { withDistro, type Distro } from '../../lib/distro'
import type { Lang } from '../../lib/i18n/locales'
import { tRich } from '../../lib/i18n/rich'
import type { ServerT } from '../../lib/i18n/server'

export function ManPageFooterSections({
  reportHref,
  urlDistro,
  urlLang,
  t,
  seeAlso,
  relatedItems,
  derived,
  concepts = [],
  hasParseWarnings = false,
}: {
  reportHref: string
  urlDistro: Distro | null
  urlLang: Lang | null
  t: ServerT
  seeAlso?: ManPageContent['seeAlso']
  relatedItems: SectionPage[]
  derived?: Pick<PageDerivedResponse, 'referencedBy' | 'family' | 'package'>
  /** Published concept explainers this page references (lib/concepts.ts). */
  concepts?: Pick<ConceptLink, 'slug' | 'term'>[]
  hasParseWarnings?: boolean
}) {
  const seeAlsoItems = (seeAlso ?? []).slice(0, 24)
  const related = relatedItems.slice(0, 24)

  const hasAddendum = seeAlsoItems.length > 0 || related.length > 0 || Boolean(derived?.referencedBy.items.length || derived?.family?.items.length || derived?.package)

  return (
    <>
      {/* BetterMan's addendum: the manual's cross-references as links, and pages that sit near this one. */}
      {hasAddendum ? (
        <div className="bm-added mt-14 px-5 py-4 text-sm max-md:-mx-5 md:px-8 md:py-5">
          {seeAlsoItems.length ? (
            <aside className={ROW} aria-label={t('See also')}>
              <h2 className={LABEL}>{t('See also')}</h2>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 font-serif text-base">
                {seeAlsoItems.map((ref) => {
                  const key = `${ref.name}:${ref.section ?? ''}`

                  if (ref.section && !ref.resolvedPageId) {
                    return (
                      <li key={key} className="text-ink-3" title={t('Not available in this dataset')}>
                        {ref.name}({ref.section})<span className="sr-only">{t(' (not available)')}</span>
                      </li>
                    )
                  }

                  const href = ref.section
                    ? withDistro(`/man/${encodeURIComponent(ref.name)}/${encodeURIComponent(ref.section)}`, urlDistro, urlLang)
                    : withDistro(`/man/${encodeURIComponent(ref.name)}`, urlDistro, urlLang)

                  return (
                    <li key={key}>
                      <a href={href} className="underline">
                        <b className="font-semibold">{ref.name}</b>
                        {ref.section ? `(${ref.section})` : null}
                      </a>
                    </li>
                  )
                })}
              </ul>
            </aside>
          ) : null}

          {related.length ? (
            <aside className={ROW} aria-label={t('Related commands')}>
              <h2 className={LABEL}>{t('Related')}</h2>
              <ul className="grid gap-y-1 sm:grid-cols-2 sm:gap-x-6">
                {related.map((item) => (
                  <li key={`${item.name}:${item.section}`} className="min-w-0 truncate">
                    <a
                      href={withDistro(`/man/${encodeURIComponent(item.name)}/${encodeURIComponent(item.section)}`, urlDistro, urlLang)}
                      className="no-underline"
                    >
                      <span className="font-serif text-base">
                        <b className="font-semibold">{item.name}</b>({item.section})
                      </span>{' '}
                      <span className="text-ink-2">{item.description}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </aside>
          ) : null}
          {[
            { id: 'referenced-by', label: t('Referenced by'), data: derived?.referencedBy },
            { id: 'family', label: t('Command family'), data: derived?.family },
          ].map(({ id, label, data }) => data?.items.length ? (
            <aside key={id} className={ROW} aria-label={label}>
              <h2 className={LABEL}>{label}</h2>
              <div>
                <ul className="flex flex-wrap gap-x-4 gap-y-1 font-serif text-base">
                  {data.items.map((item) => (
                    <li key={`${item.name}:${item.section}`}>
                      <a href={withDistro(`/man/${encodeURIComponent(item.name)}/${encodeURIComponent(item.section)}`, urlDistro, urlLang)} className="underline">
                        <b className="font-semibold">{item.name}</b>({item.section})
                      </a>
                    </li>
                  ))}
                </ul>
                {data.hasMore ? <p className="mt-1 text-xs text-ink-3">
                  {t('Showing the first {count}; additional pages are omitted.', { count: data.items.length })}{' '}
                  {id === 'family' && derived?.family ? <a className="underline" href={withDistro(`/search?q=${encodeURIComponent(`${derived.family.name}-`)}`, urlDistro, urlLang)}>{t('Browse the family')}</a> : null}
                </p> : null}
              </div>
            </aside>
          ) : null)}
          {derived?.package ? (
            <p className={ROW}>
              <span className={LABEL}>{t('Package')}</span>
              <a className="w-fit font-mono underline" href={withDistro(`/pkg/${encodeURIComponent(derived.package.name)}`, urlDistro, urlLang)}>
                {derived.package.name}{derived.package.version ? ` ${derived.package.version}` : ''}
              </a>
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-8 space-y-1 text-xs text-ink-3 print:hidden">
        {/* A quiet line, outside the manual's text: BetterMan's explainers for concepts this page relies on. */}
        {concepts.length ? (
          <nav aria-label={t('Concepts')} data-bm-concepts className="text-sm text-ink-2">
            {t('Concepts:')}{' '}
            {concepts.map((concept, index) => (
              <Fragment key={concept.slug}>
                {index ? <span aria-hidden="true"> · </span> : null}
                <a href={withDistro(`/concept/${encodeURIComponent(concept.slug)}`, urlDistro)} className="underline">
                  {concept.term}
                </a>
              </Fragment>
            ))}
          </nav>
        ) : null}
        {hasParseWarnings ? <p>{t('mandoc reported formatting warnings for this page. Some structure may be lost.')}</p> : null}
        <p>
          {tRich(t, '{link} with this page on GitHub.', {
            link: (
              <a href={reportHref} target="_blank" rel="noopener noreferrer" className="underline">
                {t('Report a problem')}
              </a>
            ),
          })}
        </p>
      </div>
    </>
  )
}

const ROW = 'grid gap-x-4 gap-y-1 py-1.5 sm:grid-cols-[7.5rem_minmax(0,1fr)]'
const LABEL = 'pt-0.5 text-sm font-normal text-ink-3'
