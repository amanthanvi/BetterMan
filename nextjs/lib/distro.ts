export type Distro = 'debian' | 'ubuntu' | 'fedora'

export const DISTROS: readonly Distro[] = ['debian', 'ubuntu', 'fedora'] as const

export function normalizeDistro(value: unknown): Distro | null {
  if (typeof value !== 'string') return null
  const v = value.trim().toLowerCase()
  if (v === 'debian' || v === 'ubuntu' || v === 'fedora') return v
  return null
}

export function isDefaultDistro(distro: Distro): boolean {
  return distro === 'debian'
}

