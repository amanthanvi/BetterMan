'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import type { Distro } from '../../lib/distro'
import { DISTRO_COOKIE, DISTRO_STORAGE_KEY, normalizeDistro } from '../../lib/distro'

type DistroContextValue = {
  /** What the current URL shows: `?distro=`, else the stored default. */
  distro: Distro
  /** The stored default distro. */
  preferred: Distro
  /** Make `distro` the stored default and show it. */
  setDistro: (distro: Distro) => void
}

function writeCookie(distro: Distro) {
  try {
    document.cookie = `${DISTRO_COOKIE}=${encodeURIComponent(distro)}; Path=/; Max-Age=31536000; SameSite=Lax`
  } catch {
    // ignore
  }
}

function readStoredDistro(): Distro | null {
  try {
    return normalizeDistro(localStorage.getItem(DISTRO_STORAGE_KEY))
  } catch {
    // ignore
  }
  return null
}

function writeStoredDistro(distro: Distro) {
  try {
    localStorage.setItem(DISTRO_STORAGE_KEY, distro)
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
  return `${base}${window.location.hash}`
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

  // `?distro=` overrides what this URL shows; only setDistro changes the stored default.
  const [preferred, setPreferred] = useState<Distro>(() => initialCookieDistro ?? 'debian')
  const distro = urlDistro ?? preferred
  const pendingUrlRef = useRef<string | null>(null)

  const setDistro = useCallback(
    (next: Distro) => {
      setPreferred(next)
      writeStoredDistro(next)
      writeCookie(next)

      const url = buildUrlWithDistro({
        pathname,
        searchParams: new URLSearchParams(search),
        distro: next,
      })
      pendingUrlRef.current = url
      router.replace(url, { scroll: false })
    },
    [pathname, router, search],
  )

  // Next 16.4 caches the first page's hash in that route's URL and appends the
  // requested hash again on a later visit, so `/man/tar/1#a` becomes `#a#a`.
  // A null state lets Next copy its own history state and sync its router URL.
  useEffect(() => {
    const url = pendingUrlRef.current
    pendingUrlRef.current = null
    if (!url) return
    const intended = new URL(url, window.location.origin)
    if (intended.pathname !== window.location.pathname || intended.search !== window.location.search) return
    if (intended.hash !== window.location.hash) window.history.replaceState(null, '', url)
  }, [pathname, search])

  useEffect(() => {
    const stored = readStoredDistro()
    if (!stored) return
    setPreferred(stored)
    writeCookie(stored)
  }, [])

  const value = useMemo(() => ({ distro, preferred, setDistro }), [distro, preferred, setDistro])
  return <DistroContext.Provider value={value}>{children}</DistroContext.Provider>
}

export function useDistro(): DistroContextValue {
  const ctx = useContext(DistroContext)
  if (!ctx) throw new Error('useDistro must be used within <DistroProvider>')
  return ctx
}
