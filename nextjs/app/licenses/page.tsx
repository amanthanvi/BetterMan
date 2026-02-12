import { cookies } from 'next/headers'
import type { Metadata } from 'next'

import { LicensesClient } from './LicensesClient'
import { fetchLicenses } from '../../lib/api'
import { normalizeDistro } from '../../lib/distro'

export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

function getFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

export function generateMetadata(): Metadata {
  return {
    title: 'Licenses — BetterMan',
    description: 'Attribution and license notices for the current BetterMan dataset release.',
    openGraph: {
      title: 'Licenses — BetterMan',
      description: 'Attribution and license notices for the current BetterMan dataset release.',
      type: 'website',
      images: ['/og-image.png'],
    },
  }
}

export default async function LicensesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const cookieStore = await cookies()
  const cookieDistro = cookieStore.get('bm-distro')?.value
  const distro = normalizeDistro(getFirst(sp.distro)) ?? normalizeDistro(cookieDistro) ?? 'debian'

  const data = await fetchLicenses({ distro })
  return <LicensesClient distro={distro} data={data} />
}
