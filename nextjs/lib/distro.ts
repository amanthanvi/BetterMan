export type Distro = 'debian' | 'ubuntu' | 'fedora' | 'arch' | 'alpine' | 'freebsd' | 'macos'

export const DISTRO_GROUPS: ReadonlyArray<{ label: string; items: readonly Distro[] }> = [
  { label: 'Linux', items: ['debian', 'ubuntu', 'fedora', 'arch', 'alpine'] as const },
  { label: 'BSD', items: ['freebsd', 'macos'] as const },
] as const

export const DISTROS: readonly Distro[] = DISTRO_GROUPS.flatMap((g) => g.items)

export const DISTRO_LABEL: Record<Distro, string> = {
  debian: 'Debian',
  ubuntu: 'Ubuntu',
  fedora: 'Fedora',
  arch: 'Arch Linux',
  alpine: 'Alpine',
  freebsd: 'FreeBSD',
  macos: 'macOS (BSD)',
}

export function normalizeDistro(value: unknown): Distro | null {
  if (typeof value !== 'string') return null
  const v = value.trim().toLowerCase()
  if (
    v === 'debian' ||
    v === 'ubuntu' ||
    v === 'fedora' ||
    v === 'arch' ||
    v === 'alpine' ||
    v === 'freebsd' ||
    v === 'macos'
  )
    return v
  return null
}

export function isDefaultDistro(distro: Distro): boolean {
  return distro === 'debian'
}

export function withDistro(loc: string, distro: string): string {
  if (!distro || distro === 'debian') return loc
  const isAbsolute = /^https?:\/\//.test(loc)
  const url = isAbsolute ? new URL(loc) : new URL(loc, 'https://example.invalid')
  url.searchParams.set('distro', distro)
  return isAbsolute ? url.toString() : `${url.pathname}${url.search}${url.hash}`
}
