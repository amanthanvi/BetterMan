import { createContext, useCallback, useContext, useMemo, useState } from 'react'

export type Distro = 'debian' | 'ubuntu' | 'fedora'

export const DISTROS: readonly Distro[] = ['debian', 'ubuntu', 'fedora'] as const

const DISTRO_KEY = 'bm-distro'

export function normalizeDistro(value: unknown): Distro | undefined {
  if (typeof value !== 'string') return undefined
  const v = value.trim().toLowerCase()
  if (v === 'debian' || v === 'ubuntu' || v === 'fedora') return v
  return undefined
}

export function readStoredDistro(): Distro {
  try {
    return normalizeDistro(localStorage.getItem(DISTRO_KEY)) ?? 'debian'
  } catch {
    // ignore
  }
  return 'debian'
}

export function writeStoredDistro(distro: Distro) {
  try {
    localStorage.setItem(DISTRO_KEY, distro)
  } catch {
    // ignore
  }
}

export function readUrlDistro(): Distro | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    return normalizeDistro(new URL(window.location.href).searchParams.get('distro'))
  } catch {
    return undefined
  }
}

export function getEffectiveDistro(): Distro {
  return readUrlDistro() ?? readStoredDistro()
}

export function writeUrlDistro(distro: Distro) {
  if (typeof window === 'undefined') return
  try {
    const url = new URL(window.location.href)
    if (distro === 'debian') url.searchParams.delete('distro')
    else url.searchParams.set('distro', distro)
    window.history.replaceState(null, '', url.toString())
  } catch {
    // ignore
  }
}

type DistroContextValue = {
  distro: Distro
  setDistro: (distro: Distro) => void
}

const DistroContext = createContext<DistroContextValue | null>(null)

function readInitialDistro(): Distro {
  const fromUrl = readUrlDistro()
  if (fromUrl) {
    writeStoredDistro(fromUrl)
    return fromUrl
  }
  return readStoredDistro()
}

export function DistroProvider({ children }: { children: React.ReactNode }) {
  const [distro, setDistroState] = useState<Distro>(() => readInitialDistro())

  const setDistro = useCallback((next: Distro) => {
    setDistroState(next)
    writeStoredDistro(next)
  }, [])

  const value = useMemo(() => ({ distro, setDistro }), [distro, setDistro])
  return <DistroContext.Provider value={value}>{children}</DistroContext.Provider>
}

export function useDistro(): DistroContextValue {
  const ctx = useContext(DistroContext)
  if (!ctx) throw new Error('useDistro must be used within <DistroProvider>')
  return ctx
}

export const DISTRO_LABEL: Record<Distro, string> = {
  debian: 'Debian',
  ubuntu: 'Ubuntu',
  fedora: 'Fedora',
}
