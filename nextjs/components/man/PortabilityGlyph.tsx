import type { PageDerivedResponse } from '../../../convex/_derivedEncoding'
import type { ServerKey } from '../../lib/i18n/catalog/en/server'
import type { ServerT } from '../../lib/i18n/server'

// Each code's mark and the catalog key of what it means.
const cells = {
  a: ['■', 'option available'], x: ['□', 'flag absent from this manual'],
  p: ['—', 'manual page not included on this system'],
  d: ['◐', 'different argument shape'], n: ['◐', 'different tar meaning: archive seek or no recursion'],
  i: ['◐', 'different tar compression-program or include-list meaning'],
  l: ['?', 'portability not loaded for this option'],
  u: ['?', 'no active dataset'], e: ['?', 'option data unavailable'], t: ['?', 'option data incomplete'],
} as const satisfies Record<string, readonly [string, ServerKey]>
const names = ['GNU/Linux', 'FreeBSD', 'macOS']
/** `always` draws fully available rows too: explain shows the cells on every flag. */
export function PortabilityGlyph({ codes, systems, always = false, t }: {
  codes: string
  systems: PageDerivedResponse['portability']['systems']
  always?: boolean
  t: ServerT
}) {
  if (codes === 'aaa' && !always) return null
  const meanings = [...codes].map((code) => cells[code as keyof typeof cells] ?? cells.e)
  const label = meanings.map((cell, i) => `${names[i]}${systems[i]?.distro ? ` (${systems[i].distro})` : ''}: ${t(cell[1])}`).join('; ')
  return <span className="bm-pg ml-2" role="img" aria-label={label} title={label}>
    {[...codes].map((code, i) => {
      if (code === 'a' || code === 'x' || ['d', 'n', 'i'].includes(code)) {
        return <i key={i} data-v={code === 'a' ? 'yes' : code === 'x' ? 'no' : 'differs'} />
      }
      return <span key={i} className="inline-block w-[7px] text-center font-mono text-xs leading-none text-ink-3" data-v={code === 'p' ? 'page-unavailable' : 'unknown'}>{meanings[i][0]}</span>
    })}
  </span>
}
