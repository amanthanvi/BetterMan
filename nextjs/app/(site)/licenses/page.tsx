import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { LicensesClient } from './LicensesClient'
import { FastApiError, fetchLicenses, withDistroFallback } from '../../../lib/api'
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
  ).catch((error: unknown) => {
    // Repeated promotions can exhaust the in-request restarts. Begin a fresh
    // request rather than returning an HTML 500 or mixing release generations.
    if (error instanceof FastApiError && error.code === 'RELEASE_CHANGED') {
      redirect(`/licenses?distro=${requestedDistro}`)
    }
    throw error
  })
  return <LicensesClient distro={distro} data={data} />
}
