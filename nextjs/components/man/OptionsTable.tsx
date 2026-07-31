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
    <div className="overflow-x-auto rounded-md border border-edge bg-surface">
      <table className="w-full border-collapse text-left text-sm" aria-label="Command-line options">
        <tbody>
          {options.map((opt) => {
            const selected = selectedAnchorId === opt.anchorId
            const flashing = flashAnchorId === opt.anchorId
            const flagParts = splitFlags(opt.flags)
            const badgeClass = `inline-flex items-center rounded-sm border px-2 py-1 font-mono text-xs transition-colors ${
              selected
                ? 'border-accent-edge bg-accent-subtle text-fg'
                : 'border-edge bg-raised text-fg hover:border-edge-strong'
            }`

            return (
              <tr
                key={opt.anchorId}
                className={`border-b border-edge last:border-b-0 ${flashing ? 'bm-option-flash' : ''}`}
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
                      <span className="inline-flex items-center rounded-sm border border-edge bg-raised px-2 py-1 font-mono text-xs text-muted">
                        {opt.argument}
                      </span>
                    ) : null}
                  </a>
                </td>
                <td className="px-3 py-2 text-muted">{opt.description}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
