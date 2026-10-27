'use client'

import type { OptionItem } from '../../lib/docModel'

import { parseOptionTerms } from './find'

function splitFlags(flags: string): string[] {
  const parsed = parseOptionTerms(flags)
  return parsed.length ? parsed : [flags.trim()].filter(Boolean)
}

export function OptionsTable({
  options,
  rowIds,
  selectedAnchorId,
  flashAnchorId,
  onSelect,
}: {
  options: OptionItem[]
  /** Row anchor per `anchorId`, distinct from the body definition's id. */
  rowIds: ReadonlyMap<string, string>
  selectedAnchorId?: string | null
  flashAnchorId?: string | null
  onSelect?: (opt: OptionItem, event: React.MouseEvent<HTMLAnchorElement>) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm" aria-label="Command-line options">
        <tbody>
          {options.map((opt) => {
            const selected = selectedAnchorId === opt.anchorId
            const flashing = flashAnchorId === opt.anchorId
            const rowId = rowIds.get(opt.anchorId) ?? `opt-${opt.anchorId}`
            const flagParts = splitFlags(opt.flags)
            const flagClass = `font-mono text-sm font-semibold transition-colors group-hover:text-accent ${
              selected ? 'text-accent underline decoration-2 underline-offset-4' : 'text-fg'
            }`

            return (
              <tr
                key={opt.anchorId}
                className={`border-b border-edge last:border-b-0 ${flashing ? 'bm-option-flash' : ''}`}
              >
                <td className="w-[28ch] py-2.5 pl-0 pr-4 align-top">
                  <a
                    href={`#${rowId}`}
                    id={rowId}
                    className="group scroll-mt-24 inline-flex flex-wrap gap-x-3 gap-y-1 no-underline"
                    onClick={(e) => onSelect?.(opt, e)}
                  >
                    {flagParts.map((flag) => (
                      <span key={flag} className={flagClass}>
                        {flag}
                      </span>
                    ))}
                    {opt.argument ? <span className="font-mono text-sm italic text-muted">{opt.argument}</span> : null}
                  </a>
                </td>
                <td className="py-2.5 pl-0 pr-4 text-muted">{opt.description}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
