'use client'

import type { OptionItem } from '../../lib/docModel'

import { parseOptionTerms } from './find'
import { PortabilityGlyph, type Portability } from './Portability'

function splitFlags(flags: string): string[] {
  const parsed = parseOptionTerms(flags)
  return parsed.length ? parsed : [flags.trim()].filter(Boolean)
}

/**
 * Rows of the index of options: the flags in bold mono, the one-line description,
 * and the number of the section that defines them.
 */
export function OptionsTable({
  options,
  rowIds,
  locators,
  portability,
  selectedAnchorId,
  flashAnchorId,
  onSelect,
}: {
  options: OptionItem[]
  /** Row anchor per `anchorId`, distinct from the body definition's id. */
  rowIds: ReadonlyMap<string, string>
  /** Section number per `anchorId`, from `definitionLocators()`. */
  locators?: ReadonlyMap<string, string>
  /** Per `anchorId`; a glyph is drawn only beside flags that are not portable. */
  portability?: ReadonlyMap<string, Portability>
  selectedAnchorId?: string | null
  flashAnchorId?: string | null
  onSelect?: (opt: OptionItem, event: React.MouseEvent<HTMLAnchorElement>) => void
}) {
  return (
    <table className="w-full border-collapse text-left" aria-label="Command-line options">
      <thead className="sr-only">
        <tr>
          <th scope="col">Option</th>
          <th scope="col">Description</th>
          <th scope="col">Section</th>
        </tr>
      </thead>
      <tbody>
        {options.map((opt) => {
          const selected = selectedAnchorId === opt.anchorId
          const rowId = rowIds.get(opt.anchorId) ?? `opt-${opt.anchorId}`
          const p = portability?.get(opt.anchorId)

          return (
            <tr key={opt.anchorId} className={flashAnchorId === opt.anchorId ? 'bm-option-flash' : undefined}>
              <td className="w-[45%] py-1 pr-4 align-baseline sm:w-[18rem]">
                <a
                  href={`#${rowId}`}
                  id={rowId}
                  className={`group scroll-mt-24 font-mono text-[0.8125rem] font-bold no-underline [overflow-wrap:anywhere] ${
                    selected ? 'text-accent underline decoration-2 underline-offset-4' : 'text-ink hover:text-accent'
                  }`}
                  onClick={(e) => onSelect?.(opt, e)}
                >
                  {splitFlags(opt.flags).map((flag) => (
                    <span key={flag} className="bm-flag">
                      {flag}
                    </span>
                  ))}
                  {opt.argument ? <i className="font-normal text-ink-2"> {opt.argument}</i> : null}
                </a>
                {p ? (
                  <>
                    {' '}
                    <PortabilityGlyph portability={p} />
                  </>
                ) : null}
              </td>
              <td className="py-1 pr-4 align-baseline text-sm text-ink-2">{opt.description}</td>
              <td className="w-10 py-1 text-right align-baseline font-serif text-sm text-ink-3 oldstyle-nums">
                {locators?.get(opt.anchorId)}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
