import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'

import { RunningHead } from '../components/man/RunningHead'
import { Kbd } from '../components/ui/Kbd'
import { withLang } from '../lib/i18n/locales'
import { requestLangFromHeaders } from '../lib/i18n/request'
import { tRich } from '../lib/i18n/rich'
import { getI18n } from '../lib/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n(requestLangFromHeaders(await headers()))
  return { title: t('{title} — BetterMan', { title: t('Not found') }) }
}

export default async function NotFound() {
  // The language of the URL that missed, which the proxy hands over as a header.
  const lang = requestLangFromHeaders(await headers())
  const { t } = await getI18n(lang)
  const explicit = lang === 'en' ? null : lang
  return (
    <div className="mx-auto max-w-[46rem]">
      <RunningHead title="ERRNO(3)" label={t('404 Not Found')} end="ENOENT" />
      <div className="pt-[12vh]">
        <h1 className="break-words font-mono text-[1.625rem] leading-snug">{t('No such file or directory')}</h1>
        <p className="mt-4 font-serif text-lg text-ink-2">{tRich(t, 'Nothing lives at this address. Press {key} to search the manual.', { key: <Kbd>⌘K</Kbd> })}</p>
        <p className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link href={withLang('/', explicit)} className="underline">
            {t('Go home')}
          </Link>
          <Link href={withLang('/search', explicit)} className="underline">
            {t('Search')}
          </Link>
        </p>
      </div>
    </div>
  )
}
