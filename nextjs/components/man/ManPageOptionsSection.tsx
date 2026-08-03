'use client'

import type { OptionItem } from '../../lib/docModel'

import { Button } from '../ui/Button'
import { OptionsTable } from './OptionsTable'
import { ManSectionLabel } from './RunningHead'

export const OPTIONS_COLLAPSE_THRESHOLD = 20
export const OPTIONS_PREVIEW_COUNT = 10

export function ManPageOptionsSection({
  optionTerms,
  onClearHighlight,
  options,
  optionsCount,
  optionsExpanded,
  onToggleOptionsExpanded,
  selectedAnchorId,
  flashAnchorId,
  onSelectOption,
}: {
  optionTerms: string[]
  onClearHighlight: () => void
  options?: OptionItem[] | null
  optionsCount: number
  optionsExpanded: boolean
  onToggleOptionsExpanded: () => void
  selectedAnchorId?: string | null
  flashAnchorId?: string | null
  onSelectOption: (opt: OptionItem) => void
}) {
  const allOptions = options ?? []
  const hasOptions = allOptions.length > 0
  const collapsible = optionsCount > OPTIONS_COLLAPSE_THRESHOLD
  const visibleOptions = collapsible && !optionsExpanded ? allOptions.slice(0, OPTIONS_PREVIEW_COUNT) : allOptions

  return (
    <>
      {optionTerms.length ? (
        <div className="mb-8 flex flex-wrap items-baseline justify-between gap-3 border-b border-edge pb-2 text-sm text-muted">
          <div className="min-w-0">
            <span className="font-mono text-xs tracking-wide">Highlighting</span>{' '}
            <span className="font-mono text-sm text-fg">{optionTerms.join(' ')}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={onClearHighlight}>
            Clear
          </Button>
        </div>
      ) : null}

      {hasOptions ? (
        <section className="mb-10" aria-label="Options">
          <ManSectionLabel as="h2">
            OPTIONS <span className="font-normal text-faint">· {optionsCount}</span>
          </ManSectionLabel>

          <div className="mt-3">
            <OptionsTable
              options={visibleOptions}
              selectedAnchorId={selectedAnchorId}
              onSelect={onSelectOption}
              flashAnchorId={flashAnchorId}
            />
          </div>

          {collapsible ? (
            <div className="mt-2">
              <Button variant="ghost" size="sm" onClick={onToggleOptionsExpanded}>
                {optionsExpanded ? 'Show fewer options' : `Show all ${optionsCount} options`}
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  )
}
