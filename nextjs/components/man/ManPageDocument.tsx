import type { PageDerivedResponse } from '../../../convex/_derivedEncoding'

import type { SectionPage } from '../../lib/api'
import { conceptsForPage } from '../../lib/concepts'
import { DISTRO_LABEL, manPageHref, type Distro } from '../../lib/distro'
import type { ManPage, ManPageBrief, ManPageContent, ManPageResponse, ManPageVariant } from '../../lib/docModel'
import { extractExamples } from '../../lib/examples'
import type { Lang } from '../../lib/i18n/locales'
import type { ServerT } from '../../lib/i18n/server'
import { LANG_NAMES, setLang } from '../../lib/i18n/locales'
import { langSwitchHref } from '../../lib/i18n/switch'
import type { TranslationOutcome } from '../../lib/manLookup'
import { briefView, modeAnchors } from '../../lib/manBrief'
import { ChevronDownIcon } from '../icons'
import { defaultCodeLanguage } from '../doc/CodeBlock'
import { DocRenderer } from '../doc/DocRenderer'
import { Toc } from '../toc/Toc'
import { IconButton } from '../ui/IconButton'
import { stripHeaderSections } from './manBody'
import { ManPageBriefSection } from './ManPageBrief'
import { ManPageFooterSections } from './ManPageFooterSections'
import { ManPageHeaderCard } from './ManPageHeaderCard'
import { ManPageOptionsSection } from './ManPageOptionsSection'
import { collectBlockIds, optionRowIds } from './optionAnchors'
import { ManSectionLabel, RunningFoot, RunningHead, sectionLabel } from './RunningHead'
import { definitionLocators, sectionNumbers } from './sectionNumbers'
import { SIDEBAR_OPEN_COLUMNS } from './sidebarColumns'

/**
 * A rendered manual, as plain server HTML. Everything a reader needs is in the
 * markup; the man page script (man-client/) adds find, the pager keys, option
 * selection, the overlays and the reader's stored state. `data-bm-manual` tells
 * it a manual is rendered, so the pager keys apply (a man-page 404 has none).
 */
export function ManPageDocument({
  page,
  content,
  variants,
  servedDistro,
  urlDistro,
  relatedItems,
  derived,
  brief,
  providers,
  portabilityMode = 'glyph',
  portabilityToggleHref,
  reportHref,
  urlLang,
  t,
  translation,
  drift,
}: {
  page: ManPage
  content: ManPageContent
  variants: ManPageVariant[]
  /** The distro the server rendered, which differs from the URL's after a fallback. */
  servedDistro: Distro
  urlDistro: Distro | null
  relatedItems: SectionPage[]
  /** B7's derived corpus metadata: portability, new-in marks, most-used flags, cross-references. */
  derived?: PageDerivedResponse
  providers?: ManPageResponse['providers']
  /** B6's generated layer: summary and sourced examples. */
  brief?: ManPageBrief | null
  /** `?portability=text` shows the cells as words. */
  portabilityMode?: 'glyph' | 'text'
  /** This URL with the other portability mode. */
  portabilityToggleHref?: string
  /** A prefilled GitHub issue for this page, built with the public origin. */
  reportHref: string
  urlLang: Lang | null
  t: ServerT
  /** `?lang=` (#395): the translation itself, or English because the language lacks the page. */
  translation?: TranslationOutcome
  /** How the translation lags English (#395); shown only on a translated page. */
  drift?: ManPageResponse['translationDrift']
}) {
  const inBrief = briefView({
    brief,
    fallbackExamples: extractExamples(content.blocks),
    mostUsed: derived?.mostUsed,
    options: content.options ?? [],
    blocks: content.blocks,
  })
  const codeLanguage = defaultCodeLanguage(page.section)
  const body = stripHeaderSections(content.blocks, content.toc ?? [], { hasSynopsis: Boolean(content.synopsis?.length) })
  const bodyIds = collectBlockIds(body.blocks)
  const optionRows = optionRowIds(content.options ?? [], bodyIds)
  const numbers = sectionNumbers(body.toc)
  const locators = definitionLocators(body.blocks, numbers)
  const hasToc = body.toc.length > 0

  const title = `${page.name.toUpperCase()}(${page.section})`
  const edition = page.sourcePackage
    ? `${page.sourcePackage}${page.sourcePackageVersion ? ` ${page.sourcePackageVersion}` : ''}`
    : DISTRO_LABEL[servedDistro]

  const manualLang = translation?.state === 'translated' ? translation.lang : undefined
  // The English original is linked only when English has the route.
  // The English original is linked only when English has the page itself. Through B9's switch: a bare
  // URL would send a reader with a remembered language straight back to this one.
  const englishHref = translation?.state === 'translated' && translation.englishHasRoute
    ? langSwitchHref('en', setLang(manPageHref(page.name, page.section, urlDistro), null))
    : null

  return (
    <div data-bm-manual data-bm-page-name={page.name} data-bm-page-section={page.section} data-bm-page-description={page.description || page.title}>
      {/* Under 400px the title already carries name(section); the head would only crowd it. */}
      <RunningHead title={title} label={sectionLabel(page.section, t, servedDistro)} className="max-[25rem]:hidden" />

      <div data-bm-layout className={`mt-9 ${hasToc ? `lg:grid lg:items-start lg:gap-16 ${SIDEBAR_OPEN_COLUMNS}` : ''}`}>
        {hasToc ? (
          <aside className="hidden lg:block lg:self-stretch">
            <div className="sticky top-16">
              <div data-bm-sidebar className="h-[calc(100dvh-4rem)] overflow-y-auto pb-8 [scrollbar-width:thin]">
                <div data-bm-sidebar-open>
                  <div className="flex items-center justify-between gap-3 pl-3.5">
                    <ManSectionLabel as="h2" className="text-sm">
                      {t('Contents')}
                    </ManSectionLabel>
                    <IconButton variant="ghost" size="sm" data-bm-action="collapse-sidebar" aria-label={t('Collapse sidebar')} title={t('Collapse (b)')} className="bm-js">
                      <ChevronDownIcon className="size-3.5 rotate-90" />
                    </IconButton>
                  </div>
                  <div className="mt-2">
                    <Toc items={body.toc} activeId={body.toc[0]?.id ?? null} showTitle={false} t={t} />
                  </div>
                </div>
                <div data-bm-sidebar-closed hidden>
                  <IconButton variant="ghost" size="sm" data-bm-action="expand-sidebar" aria-label={t('Expand sidebar')} title={t('Expand (b)')}>
                    <ChevronDownIcon className="size-3.5 -rotate-90" />
                  </IconButton>
                </div>
              </div>
            </div>
          </aside>
        ) : null}

        <div className="mx-auto w-full min-w-0 max-w-[var(--bm-reading-column-width)] lg:mx-0">
          {translation ? (
            <p data-bm-translation={translation.state} className="mb-4 text-xs text-ink-3">
              {translation.state === 'translated' ? (
                <>
                  {page.sourcePackage
                    ? t('{language} translation shipped by {distro} in {package}.', { language: LANG_NAMES[translation.lang], distro: DISTRO_LABEL[servedDistro], package: page.sourcePackage })
                    : t('{language} translation shipped by {distro}.', { language: LANG_NAMES[translation.lang], distro: DISTRO_LABEL[servedDistro] })}
                  {englishHref ? <>{' '}<a href={englishHref} hrefLang="en" className="underline">{t('English original')}</a></> : null}
                  {drift ? <TranslationDriftNote drift={drift} t={t} /> : null}
                </>
              ) : translation.noRelease ? (
                t('BetterMan has no {language} manuals for {distro} yet; this is the English page.', { language: LANG_NAMES[translation.lang], distro: DISTRO_LABEL[servedDistro] })
              ) : (
                t('{distro} ships no {language} translation of {citation}; this is the English page.', { language: LANG_NAMES[translation.lang], distro: DISTRO_LABEL[servedDistro], citation: `${page.name}(${page.section})` })
              )}
            </p>
          ) : null}

          <ManPageHeaderCard page={page} synopsis={content.synopsis} variants={variants} providers={providers} distro={servedDistro} hasToc={hasToc} urlLang={urlLang} t={t} contentLang={manualLang} />

          {/* `lang` marks the manual's own text only; BetterMan's labels keep the page's UI language (#395). */}
          <article className="mt-10">
            {inBrief ? <ManPageBriefSection view={inBrief} t={t} /> : null}

            <ManPageOptionsSection
              contentLang={manualLang}
              portability={derived ? { portability: derived.portability, stale: derived.stale } : undefined}
              newIn={derived?.newIn}
              portabilityMode={portabilityMode}
              portabilityToggleHref={portabilityToggleHref}
              modes={modeAnchors(content.blocks)}
              options={content.options}
              rowIds={optionRows}
              locators={locators}
              t={t}
            />

            {manualLang ? (
              <div lang={manualLang} data-bm-manual-text>
                <DocRenderer blocks={body.blocks} urlDistro={urlDistro} urlLang={urlLang} codeLanguage={codeLanguage} sectionNumbers={numbers} t={t} />
              </div>
            ) : (
              <DocRenderer blocks={body.blocks} urlDistro={urlDistro} urlLang={urlLang} codeLanguage={codeLanguage} sectionNumbers={numbers} t={t} />
            )}

            <ManPageFooterSections
              reportHref={reportHref}
              urlDistro={urlDistro}
              urlLang={urlLang}
              t={t}
              seeAlso={content.seeAlso}
              relatedItems={relatedItems}
              derived={derived}
              concepts={conceptsForPage(page, content)}
              hasParseWarnings={page.hasParseWarnings === true}
            />
          </article>

          <div className="mt-16">
            <RunningFoot start={edition} label={DISTRO_LABEL[servedDistro]} end={title} />
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * One line on how a translation lags English (#395): an older documented
 * release, and the options English has that it lacks. Computed after activation.
 */
function TranslationDriftNote({ drift, t }: { drift: NonNullable<ManPageResponse['translationDrift']>; t: ServerT }) {
  const more = drift.missingCount - drift.missingFlags.length
  return (
    <span data-bm-translation-drift className="block">
      {drift.older && drift.documented && drift.english
        ? <>{t('This translation documents {documented}; English documents {english}.', { documented: drift.documented, english: drift.english })}{' '}</>
        : null}
      {drift.missingCount ? (
        <>
          {t('Not in this translation:')}{' '}
          {drift.missingFlags.map((flag, index) => (
            <span key={flag}>{index ? ', ' : ''}<code className="font-mono">{flag}</code></span>
          ))}
          {more > 0 ? <>{' '}{t('{count, plural, other {and # more}}', { count: more })}</> : null}.
        </>
      ) : null}
    </span>
  )
}
