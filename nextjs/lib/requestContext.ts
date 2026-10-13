import { cookies } from 'next/headers'

import { DISTRO_COOKIE, normalizeDistro, type Distro } from './distro'

export type SearchParams = Record<string, string | string[] | undefined>

export function getFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

/**
 * Resolve the request distro: the `?distro=` param wins over the `bm-distro`
 * cookie, which wins over the default. Shared by every page so precedence
 * changes live in exactly one place.
 */
export async function resolveRequestDistro(sp: SearchParams): Promise<Distro> {
  const cookieStore = await cookies()
  const cookieDistro = cookieStore.get(DISTRO_COOKIE)?.value
  return normalizeDistro(getFirst(sp.distro)) ?? normalizeDistro(cookieDistro) ?? 'debian'
}
