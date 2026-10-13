'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import type { Distro } from '../../lib/distro'
import { DISTRO_COOKIE, DISTRO_STORAGE_KEY, normalizeDistro } from '../../lib/distro'

type DistroContextValue = {
  distro: Distro
  setDistro: (distro: Distro) => void
}

const DISTRO_KEY = DISTRO_STORAGE_KEY
const COOKIE_DISTRO = DISTRO_COOKIE

function writeCookie(distro: Distro) {
  try {
    document.cookie = `${COOKIE_DISTRO}=${encodeURIComponent(distro)}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`
  } catch {
    // ignore
  }
}

function readStoredDistro(): Distro | null {
  try {
    return normalizeDistro(localStorage.getItem(DISTRO_KEY))
  } catch {
    // ignore
  }
  return null
}

function writeStoredDistro(distro: Distro) {
  try {
    localStorage.setItem(DISTRO_KEY, distro)
  } catch {
    // ignore
  }
}

function buildUrlWithDistro(opts: { pathname: string; searchParams: URLSearchParams; distro: Distro }): string {
  const params = new URLSearchParams(opts.searchParams)
  if (opts.distro === 'debian') params.delete('distro')
  else params.set('distro', opts.distro)
  const qs = params.toString()
  const base = qs ? `${opts.pathname}?${qs}` : opts.pathname
  // Preserve the in-page anchor (e.g. an option deep-link) across distro switches.
  const hash = typeof window === 'undefined' ? '' : window.location.hash
  return `${base}${hash}`
}

const DistroContext = createContext<DistroContextValue | null>(null)

export function DistroProvider({
  children,
  initialCookieDistro,
}: {
  children: React.ReactNode
  initialCookieDistro?: Distro
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const search = searchParams.toString()
  const urlDistro = normalizeDistro(searchParams.get('distro'))

  const [distro, setDistroState] = useState<Distro>(() => urlDistro ?? initialCookieDistro ?? 'debian')

  const setDistro = useCallback(
    (next: Distro) => {
      setDistroState(next)
      writeStoredDistro(next)
      writeCookie(next)

      const url = buildUrlWithDistro({
        pathname,
        searchParams: new URLSearchParams(search),
        distro: next,
      })
      router.replace(url, { scroll: false })
    },
    [pathname, router, search],
  )

  useEffect(() => {
    if (!urlDistro) return

    setDistroState((prev) => {
      if (prev === urlDistro) return prev
      writeStoredDistro(urlDistro)
      writeCookie(urlDistro)
      return urlDistro
    })
  }, [urlDistro])

  useEffect(() => {
    if (urlDistro) return

    const stored = readStoredDistro()
    if (!stored) return

    setDistroState((prev) => {
      if (prev === stored) return prev
      writeCookie(stored)
      return stored
    })
  }, [urlDistro])

  useEffect(() => {
    writeStoredDistro(distro)
    writeCookie(distro)
  }, [distro])

  const value = useMemo(() => ({ distro, setDistro }), [distro, setDistro])
  return <DistroContext.Provider value={value}>{children}</DistroContext.Provider>
}

export function useDistro(): DistroContextValue {
  const ctx = useContext(DistroContext)
  if (!ctx) throw new Error('useDistro must be used within <DistroProvider>')
  return ctx
}
