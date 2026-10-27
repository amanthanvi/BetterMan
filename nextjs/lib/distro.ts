export type Distro = 'debian' | 'ubuntu' | 'fedora' | 'arch' | 'alpine' | 'freebsd' | 'macos'

export const DISTRO_COOKIE = 'bm-distro'
export const DISTRO_STORAGE_KEY = 'bm-distro'

export const DISTRO_GROUPS: ReadonlyArray<{ label: string; items: readonly Distro[] }> = [
  { label: 'Linux', items: ['debian', 'ubuntu', 'fedora', 'arch', 'alpine'] as const },
  { label: 'BSD', items: ['freebsd', 'macos'] as const },
] as const

export const DISTROS: readonly Distro[] = DISTRO_GROUPS.flatMap((g) => g.items)
export const DISTRO_ORDER: Record<Distro, number> = Object.fromEntries(
  DISTROS.map((distro, index) => [distro, index]),
) as Record<Distro, number>

export const DISTRO_LABEL: Record<Distro, string> = {
  debian: 'Debian',
  ubuntu: 'Ubuntu',
  fedora: 'Fedora',
  arch: 'Arch Linux',
  alpine: 'Alpine',
  freebsd: 'FreeBSD',
  macos: 'macOS (BSD-licensed subset)',
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

/**
 * Who a link is for: the distro the current page shows, and the reader's stored
 * default, which a URL without `?distro=` resolves to.
 */
export type LinkDistro = { distro: Distro; preferred: Distro }

/** A reader with no stored default, such as a crawler or a share-card fetcher. */
export function canonicalLinkDistro(distro: Distro): LinkDistro {
  return { distro, preferred: 'debian' }
}

/**
 * The `?distro=` a link needs to keep showing `distro`, or null when a bare URL
 * already does: Debian for a reader whose default is Debian. Other distros keep
 * the parameter even when they are the default, as they always have.
 */
export function distroParam({ distro, preferred }: LinkDistro): Distro | null {
  return distro === 'debian' && preferred === 'debian' ? null : distro
}

/** Option anchors are appended as written (`sort=`, `no~2`), like the options table's own links. */
export function manPageHref(name: string, section: string, link: LinkDistro, anchorId?: string): string {
  const href = withDistro(`/man/${encodeURIComponent(name)}/${encodeURIComponent(section)}`, link)
  return anchorId ? `${href}#${anchorId}` : href
}

export function withDistro(loc: string, link: LinkDistro): string {
  const param = distroParam(link)
  if (!param) return loc
  const isAbsolute = /^https?:\/\//.test(loc)
  const url = isAbsolute ? new URL(loc) : new URL(loc, 'https://example.invalid')
  url.searchParams.set('distro', param)
  return isAbsolute ? url.toString() : `${url.pathname}${url.search}${url.hash}`
}
