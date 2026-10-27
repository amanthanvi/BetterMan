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
 * Adds the current URL's explicit `?distro=` to an in-app link, Debian included,
 * so following it keeps the reading context. A bare URL passes null: its links
 * stay bare and resolve on the reader's stored default when followed.
 */
export function withDistro(loc: string, distro: Distro | null): string {
  return distro ? setDistroParam(loc, distro) : loc
}

/** Canonical, share-image, sitemap and OpenSearch URLs, where Debian is the bare form. */
export function canonicalWithDistro(loc: string, distro: string): string {
  return distro === 'debian' ? loc : setDistroParam(loc, distro)
}

function setDistroParam(loc: string, distro: string): string {
  const isAbsolute = /^https?:\/\//.test(loc)
  const url = isAbsolute ? new URL(loc) : new URL(loc, 'https://example.invalid')
  url.searchParams.set('distro', distro)
  return isAbsolute ? url.toString() : `${url.pathname}${url.search}${url.hash}`
}

/** Option anchors are appended as written (`sort=`, `no~2`), like the options table's own links. */
export function manPageHref(name: string, section: string, distro: Distro | null, anchorId?: string): string {
  const href = withDistro(`/man/${encodeURIComponent(name)}/${encodeURIComponent(section)}`, distro)
  return anchorId ? `${href}#${anchorId}` : href
}
