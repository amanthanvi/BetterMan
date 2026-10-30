import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { LicensesClient } from './LicensesClient'
import { FastApiError, fetchLicenses, withDistroFallback } from '../../../lib/api'
import { withDistro } from '../../../lib/distro'
import { localizedSeo } from '../../../lib/i18n/seo'
import { getI18n } from '../../../lib/i18n/server'
import { explicitDistro, explicitLang, resolveRequestDistro, resolveRequestLang, type SearchParams } from '../../../lib/requestContext'

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const sp = await searchParams
  const { t, lang } = await getI18n(resolveRequestLang(sp))
  const title = t('{title} — BetterMan', { title: t('Licenses') })
  const description = t('Attribution and license notices for the current BetterMan dataset release.')
  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
    ...localizedSeo(lang, withDistro('/licenses', explicitDistro(sp))),
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
      const urlDistro = explicitDistro(sp)
      // (site)/loading.tsx may already have streamed HTTP 200. Next then emits
      // a client/meta redirect; before streaming it returns HTTP 307. This is
      // request recovery, not a permanent URL move. Carry only URL state (#417).
      redirect(withDistro('/licenses', urlDistro, explicitLang(sp)))
    }
    throw error
  })
  return <LicensesClient distro={distro} data={data} />
}
