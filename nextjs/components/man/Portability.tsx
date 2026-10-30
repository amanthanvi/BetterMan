/**
 * Flag portability across GNU/Linux, FreeBSD and macOS (BetterMan 2 B7, #399).
 * Nothing supplies this data yet; the glyph renders only when it does, and only
 * for flags that are not portable. Unmarked means present on all three.
 */
import type { ServerT } from '../../lib/i18n/server'

export type Availability = 'yes' | 'no' | 'differs'

export type Portability = { linux: Availability; freebsd: Availability; macos: Availability }

const SYSTEMS = [
  ['linux', 'GNU/Linux'],
  ['freebsd', 'FreeBSD'],
  ['macos', 'macOS'],
] as const

export function isPortable(p: Portability): boolean {
  return p.linux === 'yes' && p.freebsd === 'yes' && p.macos === 'yes'
}

/** Full words for the accessible name and tooltip: "Not on FreeBSD or macOS". */
export function portabilityLabel(p: Portability): string {
  const missing = SYSTEMS.filter(([key]) => p[key] === 'no').map(([, name]) => name)
  const differs = SYSTEMS.filter(([key]) => p[key] === 'differs').map(([, name]) => name)
  const parts: string[] = []
  if (missing.length) parts.push(`Not on ${missing.join(' or ')}`)
  if (differs.length) parts.push(`${parts.length ? 'different' : 'Different'} on ${differs.join(' and ')}`)
  return parts.join('; ') || 'On all three systems'
}

export function PortabilityGlyph({ portability }: { portability: Portability }) {
  if (isPortable(portability)) return null
  const label = portabilityLabel(portability)
  return (
    <span className="bm-pg" role="img" aria-label={label} title={label}>
      {SYSTEMS.map(([key]) => (
        <i key={key} data-v={portability[key]} />
      ))}
    </span>
  )
}

/** Shown once per page, above the first glyph. `everyFlag` where every flag carries cells (explain). */
export function PortabilityLegend({ everyFlag = false, t }: { everyFlag?: boolean; t: ServerT }) {
  return (
    <p className="text-xs text-ink-3">
      <span className="bm-pg mr-1.5" aria-hidden="true">
        <i data-v="yes" />
        <i data-v="differs" />
        <i data-v="no" />
      </span>
      {t(everyFlag ? 'GNU/Linux · FreeBSD · macOS. A hollow cell means that system lacks the flag; a half-filled cell means it behaves differently there. The cells show availability, not identical behavior.' : 'GNU/Linux · FreeBSD · macOS. A hollow cell means that system lacks the flag; a half-filled cell means it behaves differently there. Unmarked flags exist on all three. The cells show availability, not identical behavior.')}
    </p>
  )
}
