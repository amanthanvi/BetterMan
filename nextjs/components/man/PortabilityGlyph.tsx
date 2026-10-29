import type { PageDerivedResponse } from '../../../convex/_derivedEncoding'

const cells: Record<string, [string, string]> = {
  a: ['■', 'option available'], x: ['□', 'flag absent from this manual'],
  p: ['—', 'manual page not included on this system'],
  d: ['◐', 'different argument shape'], n: ['◐', 'different tar seek or nonrecursive meaning'],
  i: ['◐', 'different tar compression-program or include-list meaning'],
  l: ['?', 'portability not loaded for this option'],
  u: ['?', 'no active dataset'], e: ['?', 'option data unavailable'], t: ['?', 'option data incomplete'],
}
const names = ['GNU/Linux', 'FreeBSD', 'macOS']
export function PortabilityGlyph({ codes, systems }: {
  codes: string
  systems: PageDerivedResponse['portability']['systems']
}) {
  if (codes === 'aaa') return null
  const meanings = [...codes].map((code) => cells[code] ?? cells.e)
  const label = meanings.map((cell, i) => `${names[i]}${systems[i]?.distro ? ` (${systems[i].distro})` : ''}: ${cell[1]}`).join('; ')
  return <span className="bm-pg ml-2" role="img" aria-label={label} title={label}>
    {[...codes].map((code, i) => {
      if (code === 'a' || code === 'x' || ['d', 'n', 'i'].includes(code)) {
        return <i key={i} data-v={code === 'a' ? 'yes' : code === 'x' ? 'no' : 'differs'} />
      }
      return <span key={i} className="inline-block w-[7px] text-center font-mono text-xs leading-none text-ink-3" data-v={code === 'p' ? 'page-unavailable' : 'unknown'}>{meanings[i][0]}</span>
    })}
  </span>
}
