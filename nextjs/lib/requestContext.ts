import { cookies } from 'next/headers'

import { DISTRO_COOKIE, normalizeDistro, type Distro } from './distro'

export type SearchParams = Record<string, string | string[] | undefined>

export function getFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

/** `?distro=` wins over the distro cookie, which wins over the default. */
export async function resolveRequestDistro(sp: SearchParams): Promise<Distro> {
  const cookieStore = await cookies()
  return normalizeDistro(getFirst(sp.distro)) ?? normalizeDistro(cookieStore.get(DISTRO_COOKIE)?.value) ?? 'debian'
}
