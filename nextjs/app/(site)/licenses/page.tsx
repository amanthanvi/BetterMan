import type { Metadata } from 'next'

import { LicensesClient } from './LicensesClient'
import { fetchLicenses, withDistroFallback } from '../../../lib/api'
import { resolveRequestDistro, type SearchParams } from '../../../lib/requestContext'

export function generateMetadata(): Metadata {
  return {
    title: 'Licenses — BetterMan',
    description: 'Attribution and license notices for the current BetterMan dataset release.',
    openGraph: {
      title: 'Licenses — BetterMan',
      description: 'Attribution and license notices for the current BetterMan dataset release.',
      type: 'website',
    },
  }
}

export default async function LicensesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const requestedDistro = await resolveRequestDistro(sp)

  const { distro, data } = await withDistroFallback(requestedDistro, (activeDistro) =>
    fetchLicenses({ distro: activeDistro }),
  )
  return <LicensesClient distro={distro} data={data} />
}
