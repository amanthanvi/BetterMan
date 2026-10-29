'use client'

import { useState } from 'react'

import type { OptionItem } from '../../lib/docModel'

import { Button } from '../ui/Button'
import { OptionsTable } from './OptionsTable'
import { PortabilityLegend, type Portability } from './Portability'

export const OPTIONS_COLLAPSE_THRESHOLD = 20
export const OPTIONS_PREVIEW_COUNT = 10
/** Short indexes are read at a glance; the filter appears past this many options. */
const FILTER_MIN_OPTIONS = 8

function matches(opt: OptionItem, needle: string): boolean {
  return `${opt.flags} ${opt.argument ?? ''} ${opt.description}`.toLowerCase().includes(needle)
}

/**
 * The index of options, compiled by BetterMan from the page's definitions. Its
 * filter narrows the index only; the manual text below is never hidden.
 */
export function ManPageOptionsSection({
  optionTerms,
  onClearHighlight,
  options,
  rowIds,
  locators,
  portability,
  optionsCount,
  optionsExpanded,
  onOptionsExpandedChange,
  selectedAnchorId,
  flashAnchorId,
  onSelectOption,
}: {
  optionTerms: string[]
  onClearHighlight: () => void
  options?: OptionItem[] | null
  rowIds: ReadonlyMap<string, string>
  locators?: ReadonlyMap<string, string>
  portability?: ReadonlyMap<string, Portability>
  optionsCount: number
  optionsExpanded: boolean
  onOptionsExpandedChange: (expanded: boolean) => void
  selectedAnchorId?: string | null
  flashAnchorId?: string | null
  onSelectOption: (opt: OptionItem, event: React.MouseEvent<HTMLAnchorElement>) => void
}) {
  const [filter, setFilter] = useState('')
  const allOptions = options ?? []
  const hasOptions = allOptions.length > 0
  const needle = filter.trim().toLowerCase()
  const filtered = needle ? allOptions.filter((opt) => matches(opt, needle)) : null
  const collapsible = !filtered && optionsCount > OPTIONS_COLLAPSE_THRESHOLD
  const previewOptions = filtered ?? (collapsible ? allOptions.slice(0, OPTIONS_PREVIEW_COUNT) : allOptions)
  const restOptions = collapsible ? allOptions.slice(OPTIONS_PREVIEW_COUNT) : []
  const hasPortability = Boolean(portability?.size)
  const hasLocators = Boolean(locators?.size)

  const table = (list: OptionItem[]) => (
    <OptionsTable
      options={list}
      rowIds={rowIds}
      locators={locators}
      portability={portability}
      selectedAnchorId={selectedAnchorId}
      onSelect={onSelectOption}
      flashAnchorId={flashAnchorId}
    />
  )

  return (
    <>
      {optionTerms.length ? (
        <div className="mb-8 flex flex-wrap items-baseline justify-between gap-3 border-b border-rule pb-2 text-sm text-ink-3">
          <p className="min-w-0">
            Highlighting <span className="font-mono font-bold text-ink">{optionTerms.join(' ')}</span>
          </p>
          <Button variant="ghost" size="sm" onClick={onClearHighlight}>
            Clear
          </Button>
        </div>
      ) : null}

      {hasOptions ? (
        <section className="mb-12 border-y border-rule pt-6 pb-4" aria-label="Options">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h2 className="small-caps text-lg font-semibold text-ink">Index of options</h2>
            <p className="text-xs text-ink-3">
              Compiled by BetterMan from the definitions below{hasLocators ? '; numbers are section locators' : ''}.
            </p>
          </div>

          {optionsCount > FILTER_MIN_OPTIONS ? (
            <div className="bm-js mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1">
              <input
                type="search"
                name="bm-options-filter"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={`Filter ${optionsCount} options`}
                autoComplete="off"
                spellCheck={false}
                aria-label="Filter options"
                className="bm-field max-w-64 py-1 text-sm"
              />
              <span aria-live="polite" className="text-xs text-ink-3 tabular-nums">
                {filtered ? `${filtered.length} of ${optionsCount}` : `${optionsCount} options`}
              </span>
            </div>
          ) : null}

          {hasPortability ? <div className="mt-3"><PortabilityLegend /></div> : null}

          <div className="mt-3">
            {previewOptions.length ? table(previewOptions) : <p className="font-serif italic text-ink-2">No option matches.</p>}
          </div>

          {/* A native disclosure, so the whole index opens without JavaScript and find-in-page reaches it. */}
          {restOptions.length ? (
            <details open={optionsExpanded} onToggle={(e) => onOptionsExpandedChange(e.currentTarget.open)} className="group/more">
              <summary className="mt-2 w-fit cursor-pointer list-none text-sm text-ink-2 underline decoration-rule-2 underline-offset-[3px] hover:text-accent hover:decoration-accent [&::-webkit-details-marker]:hidden">
                <span className="group-open/more:hidden">Show all {optionsCount} options</span>
                <span className="hidden group-open/more:inline">Show fewer options</span>
              </summary>
              <div className="mt-1">{table(restOptions)}</div>
            </details>
          ) : null}
        </section>
      ) : null}
    </>
  )
}
