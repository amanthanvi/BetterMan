'use client'

import type { OptionItem } from '../../lib/docModel'

import { parseOptionTerms } from './find'

function splitFlags(flags: string): string[] {
  const parsed = parseOptionTerms(flags)
  return parsed.length ? parsed : [flags.trim()].filter(Boolean)
}

export function OptionsTable({
  options,
  selectedAnchorId,
  flashAnchorId,
  onSelect,
}: {
  options: OptionItem[]
  selectedAnchorId?: string | null
  flashAnchorId?: string | null
  onSelect?: (opt: OptionItem) => void
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-[var(--bm-border)] bg-[var(--bm-surface)]">
      <table className="w-full border-collapse text-left text-sm" aria-label="Command-line options">
        <tbody>
          {options.map((opt) => {
            const selected = selectedAnchorId === opt.anchorId
            const flashing = flashAnchorId === opt.anchorId
            const flagParts = splitFlags(opt.flags)
            const badgeClass = `inline-flex items-center rounded-[var(--bm-radius-sm)] border px-2 py-1 font-mono text-xs transition-colors ${
              selected
                ? 'border-[var(--bm-border-accent)] bg-[var(--bm-accent-muted)] text-[color:var(--bm-fg)]'
                : 'border-[var(--bm-border)] bg-[var(--bm-surface-2)] text-[color:var(--bm-fg)] hover:border-[var(--bm-border-accent)]'
            }`

            return (
              <tr
                key={opt.anchorId}
                className={`border-b border-[var(--bm-border)] last:border-b-0 ${flashing ? 'bm-option-flash' : ''}`}
              >
                <td className="w-[28ch] px-3 py-2 align-top">
                  <a
                    href={`#${opt.anchorId}`}
                    id={opt.anchorId}
                    className="scroll-mt-24 inline-flex flex-wrap gap-2 no-underline"
                    onClick={() => onSelect?.(opt)}
                  >
                    {flagParts.map((flag) => (
                      <span key={flag} className={badgeClass}>
                        {flag}
                      </span>
                    ))}
                    {opt.argument ? (
                      <span className="inline-flex items-center rounded-[var(--bm-radius-sm)] border border-[var(--bm-border)] bg-[var(--bm-surface-2)] px-2 py-1 font-mono text-xs text-[color:var(--bm-muted)]">
                        {opt.argument}
                      </span>
                    ) : null}
                  </a>
                </td>
                <td className="px-3 py-2 text-[color:var(--bm-muted)]">{opt.description}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
