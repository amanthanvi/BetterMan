'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import type { Distro } from '../../lib/distro'
import { normalizeDistro } from '../../lib/distro'

type DistroContextValue = {
  distro: Distro
  setDistro: (distro: Distro) => void
}

const DISTRO_KEY = 'bm-distro'
const COOKIE_DISTRO = 'bm-distro'

function writeCookie(value: string) {
  try {
    document.cookie = `${COOKIE_DISTRO}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax`
  } catch {
    // ignore
  }
}

function readStoredDistro(): Distro {
  try {
    return normalizeDistro(localStorage.getItem(DISTRO_KEY)) ?? 'debian'
  } catch {
    // ignore
  }
  return 'debian'
}

function writeStoredDistro(distro: Distro) {
  try {
    localStorage.setItem(DISTRO_KEY, distro)
  } catch {
    // ignore
  }
}

function readUrlDistro(): Distro | null {
  if (typeof window === 'undefined') return null
  try {
    return normalizeDistro(new URL(window.location.href).searchParams.get('distro'))
  } catch {
    return null
  }
}

function buildUrlWithDistro(opts: { pathname: string; searchParams: URLSearchParams; distro: Distro }): string {
  const params = new URLSearchParams(opts.searchParams)
  if (opts.distro === 'debian') params.delete('distro')
  else params.set('distro', opts.distro)
  const qs = params.toString()
  return qs ? `${opts.pathname}?${qs}` : opts.pathname
}

const DistroContext = createContext<DistroContextValue | null>(null)

function readInitialDistro(): Distro {
  const fromUrl = readUrlDistro()
  if (fromUrl) {
    writeStoredDistro(fromUrl)
    writeCookie(fromUrl)
    return fromUrl
  }

  const stored = readStoredDistro()
  writeCookie(stored)
  return stored
}

export function DistroProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [distro, setDistroState] = useState<Distro>(() => readInitialDistro())

  const setDistro = useCallback(
    (next: Distro) => {
      setDistroState(next)
      writeStoredDistro(next)
      writeCookie(next)

      const url = buildUrlWithDistro({
        pathname,
        searchParams: new URLSearchParams(searchParams.toString()),
        distro: next,
      })
      router.replace(url, { scroll: false })
    },
    [pathname, router, searchParams],
  )

  useEffect(() => {
    const fromUrl = normalizeDistro(searchParams.get('distro'))
    if (!fromUrl) return

    setDistroState((prev) => {
      if (prev === fromUrl) return prev
      writeStoredDistro(fromUrl)
      writeCookie(fromUrl)
      return fromUrl
    })
  }, [searchParams])

  const value = useMemo(() => ({ distro, setDistro }), [distro, setDistro])
  return <DistroContext.Provider value={value}>{children}</DistroContext.Provider>
}

export function useDistro(): DistroContextValue {
  const ctx = useContext(DistroContext)
  if (!ctx) throw new Error('useDistro must be used within <DistroProvider>')
  return ctx
}

