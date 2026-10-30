import type { PageDerivedResponse } from '../../../convex/_derivedEncoding'
import type { OptionItem } from '../../lib/docModel'
import type { ServerT } from '../../lib/i18n/server'

import { portabilityWords } from '../../lib/manBrief'
import { parseOptionTerms } from './find'
import { OPTION_LINK_CLASS, OPTION_LINK_IDLE } from './optionRowClasses'
import { PortabilityGlyph } from './PortabilityGlyph'

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
  portabilityMode = 'glyph',
  newIn,
  modes,
  t,
}: {
  options: OptionItem[]
  /** Row anchor per `anchorId`, distinct from the body definition's id. */
  rowIds: ReadonlyMap<string, string>
  /** Section number per `anchorId`, from `definitionLocators()`. */
  locators?: ReadonlyMap<string, string>
  /** Per `anchorId`; a glyph is drawn only beside flags that are not portable. */
  portability?: PageDerivedResponse['portability']
  /** `text` writes the cells as words (`?portability=text`). */
  portabilityMode?: 'glyph' | 'text'
  /** Options added since the previous release of this page. */
  newIn?: PageDerivedResponse['newIn']
  /** Options defined under the page's modes heading, for the composer's conflict warning. */
  modes?: ReadonlySet<string>
  t: ServerT
}) {
  const portabilityByAnchor = new Map(portability?.rows ?? [])
  const newInByAnchor = new Map((newIn ?? []).map((mark) => [mark.anchorId, mark]))
  return (
    <table className="w-full border-collapse text-left" aria-label={t('Command-line options')}>
      <thead className="sr-only">
        <tr>
          <th scope="col">{t('Option')}</th>
          <th scope="col">{t('Description')}</th>
          <th scope="col">{t('Section')}</th>
        </tr>
      </thead>
      <tbody>
        {options.map((opt) => {
          const rowId = rowIds.get(opt.anchorId) ?? `opt-${opt.anchorId}`
          const codes = portability ? portabilityByAnchor.get(opt.anchorId) ?? 'lll' : null

          return (
            <tr
              key={opt.anchorId}
              data-bm-option-row
              data-bm-portable={codes === 'aaa' ? '' : undefined}
              data-bm-portability={codes && codes !== 'aaa' ? codes : undefined}
              data-bm-mode={modes?.has(opt.anchorId) ? '' : undefined}
              className="group/opt"
            >
              <td className="w-[45%] py-1 pr-4 align-baseline sm:w-[18rem]">
                <a
                  href={`#${rowId}`}
                  id={rowId}
                  data-bm-anchor={opt.anchorId}
                  data-bm-flags={opt.flags}
                  className={`${OPTION_LINK_CLASS} ${OPTION_LINK_IDLE}`}
                >
                  {splitFlags(opt.flags).map((flag) => (
                    <span key={flag} className="bm-flag">
                      {flag}
                    </span>
                  ))}
                  {opt.argument ? <i data-bm-option-argument className="font-normal text-ink-2"> {opt.argument}</i> : null}
                </a>
                {portability && codes ? (
                  portabilityMode === 'text' ? (
                    codes === 'aaa' ? null : <span className="ml-2 text-xs text-ink-3">{portabilityWords(codes, t)}</span>
                  ) : (
                    <>
                      {' '}
                      <PortabilityGlyph codes={codes} systems={portability.systems} t={t} />
                    </>
                  )
                ) : null}
                {/* The composer's add control: shown on the row's hover or focus, or a tap on touch (fix 6), never standing. */}
                <button
                  type="button"
                  data-bm-action="compose"
                  aria-pressed="false"
                  aria-label={t('Add {flag} to the command', { flag: splitFlags(opt.flags)[0] })}
                  className="bm-js ml-2 align-baseline text-xs text-ink-3 underline decoration-rule-2 underline-offset-2 opacity-0 hover:text-accent focus-visible:opacity-100 group-hover/opt:opacity-100 group-focus-within/opt:opacity-100 group-data-[bm-revealed]/opt:opacity-100"
                >
                  {t('add')}
                </button>
                {/* A picked flag is marked on its term; the control itself still shows only on hover, focus or tap. */}
                <span data-bm-composed-mark className="bm-js ml-2 hidden whitespace-nowrap text-xs text-accent group-data-[bm-composed]/opt:inline">
                  {t('in command')}
                </span>
                {newInByAnchor.has(opt.anchorId) ? (
                  <span className="ml-2 whitespace-nowrap text-xs text-ink-3" title={t('Not in this page’s previous release')}>
                    {newInByAnchor.get(opt.anchorId)!.packageVersion ? t('new in {version}', { version: newInByAnchor.get(opt.anchorId)!.packageVersion! }) : t('new')}
                  </span>
                ) : null}
              </td>
              <td data-bm-option-description className="py-1 pr-4 align-baseline text-sm text-ink-2">{opt.description}</td>
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
