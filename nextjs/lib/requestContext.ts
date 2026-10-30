import { cookies } from 'next/headers'

import { DISTRO_COOKIE, normalizeDistro, type Distro } from './distro'
import { resolvePublicLang } from './i18n/gate'
import { DEFAULT_LANG, type Lang } from './i18n/locales'

export type SearchParams = Record<string, string | string[] | undefined>

export function getFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

/** The URL's own `?distro=`, which in-app links carry; null for a bare URL. */
export function explicitDistro(sp: SearchParams): Distro | null {
  return normalizeDistro(getFirst(sp.distro))
}

/** `?distro=` wins over the distro cookie, which wins over the default. */
export async function resolveRequestDistro(sp: SearchParams): Promise<Distro> {
  const cookieStore = await cookies()
  return explicitDistro(sp) ?? normalizeDistro(cookieStore.get(DISTRO_COOKIE)?.value) ?? 'debian'
}

/** The URL's own `?lang=`, which in-app links carry; null for a bare URL or a language that is not public. */
export function explicitLang(sp: SearchParams): Lang | null {
  return resolvePublicLang(getFirst(sp.lang))
}

/** The page's language: `?lang=` alone, never a cookie or Accept-Language, so English is the bare URL. */
export function resolveRequestLang(sp: SearchParams): Lang {
  return explicitLang(sp) ?? DEFAULT_LANG
}
