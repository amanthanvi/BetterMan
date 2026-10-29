import type { PageDerivedResponse } from '../../../convex/_derivedEncoding'

import type { OptionItem } from '../../lib/docModel'

import { OptionsTable } from './OptionsTable'
import { PortabilityLegend } from './Portability'

export const OPTIONS_COLLAPSE_THRESHOLD = 20
export const OPTIONS_PREVIEW_COUNT = 10
/** Short indexes are read at a glance; the filter appears past this many options. */
const FILTER_MIN_OPTIONS = 8

/**
 * The index of options, compiled by BetterMan from the page's definitions. Its
 * filter narrows the index only; the manual text below is never hidden.
 */
export function ManPageOptionsSection({
  options,
  rowIds,
  locators,
  portability,
  newIn,
  portabilityMode = 'glyph',
  portabilityToggleHref,
}: {
  options?: OptionItem[] | null
  rowIds: ReadonlyMap<string, string>
  locators?: ReadonlyMap<string, string>
  portability?: Pick<PageDerivedResponse, 'portability' | 'stale'>
  newIn?: PageDerivedResponse['newIn']
  portabilityMode?: 'glyph' | 'text'
  portabilityToggleHref?: string
}) {
  const allOptions = options ?? []
  const optionsCount = allOptions.length
  if (!optionsCount) return null
  const collapsible = optionsCount > OPTIONS_COLLAPSE_THRESHOLD
  const previewOptions = collapsible ? allOptions.slice(0, OPTIONS_PREVIEW_COUNT) : allOptions
  const restOptions = collapsible ? allOptions.slice(OPTIONS_PREVIEW_COUNT) : []
  const hasPortability = Boolean(portability?.portability.rows.some(([, codes]) => codes !== 'aaa') || portability && portability.portability.rows.length < portability.portability.total)
  const hasLocators = Boolean(locators?.size)

  const table = (list: OptionItem[]) => (
    <OptionsTable
      options={list}
      rowIds={rowIds}
      locators={locators}
      portability={portability?.portability}
      portabilityMode={portabilityMode}
      newIn={newIn}
    />
  )

  return (
    <section id="options-index" data-bm-options className="mb-12 border-y border-rule pt-6 pb-4" aria-label="Options">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="small-caps text-lg font-semibold text-ink">Index of options</h2>
        <p className="text-xs text-ink-3">
          Compiled by BetterMan from the definitions below{hasLocators ? '; numbers are section locators' : ''}.
        </p>
      </div>

      {/* The filters narrow this index only; the manual text below is never hidden (fix 7). */}
      {optionsCount > FILTER_MIN_OPTIONS || hasPortability ? (
        <div className="bm-js mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1">
          {optionsCount > FILTER_MIN_OPTIONS ? (
            <input
              type="search"
              name="bm-options-filter"
              data-bm-options-filter
              placeholder={`Filter ${optionsCount} options`}
              autoComplete="off"
              spellCheck={false}
              aria-label="Filter options"
              className="bm-field max-w-64 py-1 text-sm"
            />
          ) : null}
          {hasPortability ? (
            <label className="inline-flex items-baseline gap-1.5 text-sm text-ink-2">
              <input type="checkbox" name="bm-options-portable" data-bm-options-portable className="accent-accent" />
              Portable only
            </label>
          ) : null}
          <span aria-live="polite" data-bm-options-count className="text-xs text-ink-3 tabular-nums">
            {`${optionsCount} options`}
          </span>
        </div>
      ) : null}

      {hasPortability ? <div className="mt-3">
        {portabilityMode === 'glyph' ? <PortabilityLegend /> : <p className="text-xs text-ink-3">Portability across GNU/Linux, FreeBSD and macOS, in words. Unmarked flags exist on all three; this shows availability, not identical behavior.</p>}
        {portabilityMode === 'glyph' ? <p className="mt-1 text-xs text-ink-3">A dash means the manual is not included in that dataset; ? means unknown or not loaded.</p> : null}
        {portabilityToggleHref ? (
          <p className="mt-1 text-xs">
            <a href={portabilityToggleHref} className="text-ink-2 underline decoration-rule-2 underline-offset-2 hover:text-accent">
              {portabilityMode === 'glyph' ? 'Show portability as words' : 'Show portability as cells'}
            </a>
          </p>
        ) : null}
      </div> : null}
      {portability?.stale ? <p className="mt-2 text-xs text-ink-3">Portability reflects an earlier snapshot. Some comparison data may be unavailable.</p> : null}

      <div className="mt-3">{table(previewOptions)}</div>
      <p data-bm-options-empty hidden className="mt-3 font-serif italic text-ink-2">
        No option matches.
      </p>

      {/* A native disclosure, so the whole index opens without JavaScript and find-in-page reaches it. */}
      {restOptions.length ? (
        <details className="group/more">
          <summary className="mt-2 w-fit cursor-pointer list-none text-sm text-ink-2 underline decoration-rule-2 underline-offset-[3px] hover:text-accent hover:decoration-accent [&::-webkit-details-marker]:hidden">
            <span className="group-open/more:hidden">Show all {optionsCount} options</span>
            <span className="hidden group-open/more:inline">Show fewer options</span>
          </summary>
          <div className="mt-1">{table(restOptions)}</div>
        </details>
      ) : null}
    </section>
  )
}
