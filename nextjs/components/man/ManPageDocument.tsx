import type { PageDerivedResponse } from '../../../convex/_derivedEncoding'

import type { SectionPage } from '../../lib/api'
import { DISTRO_LABEL, type Distro } from '../../lib/distro'
import type { ManPage, ManPageBrief, ManPageContent, ManPageVariant } from '../../lib/docModel'
import { extractExamples } from '../../lib/examples'
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
  portabilityMode = 'glyph',
  portabilityToggleHref,
  reportHref,
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
  /** B6's generated layer: summary and sourced examples. */
  brief?: ManPageBrief | null
  /** `?portability=text` shows the cells as words. */
  portabilityMode?: 'glyph' | 'text'
  /** This URL with the other portability mode. */
  portabilityToggleHref?: string
  /** A prefilled GitHub issue for this page, built with the public origin. */
  reportHref: string
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

  return (
    <div data-bm-manual data-bm-page-name={page.name} data-bm-page-section={page.section} data-bm-page-description={page.description || page.title}>
      {/* Under 400px the title already carries name(section); the head would only crowd it. */}
      <RunningHead title={title} label={sectionLabel(page.section)} className="max-[25rem]:hidden" />

      <div data-bm-layout className={`mt-9 ${hasToc ? `lg:grid lg:items-start lg:gap-16 ${SIDEBAR_OPEN_COLUMNS}` : ''}`}>
        {hasToc ? (
          <aside className="hidden lg:block lg:self-stretch">
            <div className="sticky top-16">
              <div data-bm-sidebar className="h-[calc(100dvh-4rem)] overflow-y-auto pb-8 [scrollbar-width:thin]">
                <div data-bm-sidebar-open>
                  <div className="flex items-center justify-between gap-3 pl-3.5">
                    <ManSectionLabel as="h2" className="text-sm">
                      Contents
                    </ManSectionLabel>
                    <IconButton variant="ghost" size="sm" data-bm-action="collapse-sidebar" aria-label="Collapse sidebar" title="Collapse (b)" className="bm-js">
                      <ChevronDownIcon className="size-3.5 rotate-90" />
                    </IconButton>
                  </div>
                  <div className="mt-2">
                    <Toc items={body.toc} activeId={body.toc[0]?.id ?? null} showTitle={false} />
                  </div>
                </div>
                <div data-bm-sidebar-closed hidden>
                  <IconButton variant="ghost" size="sm" data-bm-action="expand-sidebar" aria-label="Expand sidebar" title="Expand (b)">
                    <ChevronDownIcon className="size-3.5 -rotate-90" />
                  </IconButton>
                </div>
              </div>
            </div>
          </aside>
        ) : null}

        <div className="mx-auto w-full min-w-0 max-w-[var(--bm-reading-column-width)] lg:mx-0">
          <ManPageHeaderCard page={page} synopsis={content.synopsis} variants={variants} distro={servedDistro} hasToc={hasToc} />

          <article className="mt-10">
            {inBrief ? <ManPageBriefSection view={inBrief} /> : null}

            <ManPageOptionsSection
              portability={derived ? { portability: derived.portability, stale: derived.stale } : undefined}
              newIn={derived?.newIn}
              portabilityMode={portabilityMode}
              portabilityToggleHref={portabilityToggleHref}
              modes={modeAnchors(content.blocks)}
              options={content.options}
              rowIds={optionRows}
              locators={locators}
            />

            <DocRenderer blocks={body.blocks} urlDistro={urlDistro} codeLanguage={codeLanguage} sectionNumbers={numbers} />

            <ManPageFooterSections
              reportHref={reportHref}
              urlDistro={urlDistro}
              seeAlso={content.seeAlso}
              relatedItems={relatedItems}
              derived={derived}
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
