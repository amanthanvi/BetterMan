'use client'

import type { OptionItem } from '../../lib/docModel'

import { OptionsTable } from './OptionsTable'

export function ManPageOptionsSection({
  optionTerms,
  onClearHighlight,
  options,
  optionsCount,
  optionsVisible,
  onToggleOptionsVisible,
  selectedAnchorId,
  flashAnchorId,
  onSelectOption,
}: {
  optionTerms: string[]
  onClearHighlight: () => void
  options?: OptionItem[] | null
  optionsCount: number
  optionsVisible: boolean
  onToggleOptionsVisible: () => void
  selectedAnchorId?: string | null
  flashAnchorId?: string | null
  onSelectOption: (opt: OptionItem) => void
}) {
  const hasOptions = Boolean(options?.length)

  return (
    <>
      {optionTerms.length ? (
        <div className="mb-8 rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] p-4 text-sm text-[color:var(--bm-muted)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-mono text-xs tracking-wide text-[color:var(--bm-muted)]">Highlighting options</div>
              <div className="mt-2 font-mono text-sm text-[color:var(--bm-fg)]">{optionTerms.join(' ')}</div>
            </div>
            <button
              type="button"
              className="rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface-2)] px-3 py-2 text-xs font-medium text-[color:var(--bm-fg)] transition-colors hover:border-[var(--bm-border-accent)] hover:bg-[var(--bm-surface-3)]"
              onClick={onClearHighlight}
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}

      {hasOptions ? (
        <section className="mb-10" aria-label="Options">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="font-mono text-xs tracking-wide text-[color:var(--bm-muted)]">
              Options{optionsCount ? <span className="text-[color:var(--bm-muted)]"> · {optionsCount}</span> : null}
            </div>
            <button
              type="button"
              className="rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface-2)] px-3 py-2 text-xs font-medium text-[color:var(--bm-fg)] transition-colors hover:border-[var(--bm-border-accent)] hover:bg-[var(--bm-surface-3)]"
              onClick={onToggleOptionsVisible}
            >
              {optionsVisible ? 'Hide' : 'Show'}
            </button>
          </div>

          {optionsVisible ? (
            <div className="mt-3">
              <OptionsTable
                options={options ?? []}
                selectedAnchorId={selectedAnchorId}
                onSelect={onSelectOption}
                flashAnchorId={flashAnchorId}
              />
            </div>
          ) : (
            <div className="mt-3 rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)] p-4 text-sm text-[color:var(--bm-muted)]">
              This man page has a large options table. Expand it if you need to jump to a flag.
            </div>
          )}
        </section>
      ) : null}
    </>
  )
}
