'use client'

import type { Distro } from '../lib/distro'
import type { Translations } from '../lib/i18n/lite'
import type { Lang } from '../lib/i18n/locales'
import type { ReadingPreferences } from '../lib/readingPrefs'
import { AppShell } from '../components/shell/AppShell'
import { DistroProvider } from '../components/state/distro'
import { LangProvider } from '../components/state/lang'
import { ReadingPrefsProvider } from '../components/state/readingPrefs'
import { ThemeProvider } from '../components/state/theme'
import { TocProvider } from '../components/state/toc'

export function Providers({
  children,
  initialCookieDistro,
  initialReadingPrefs,
  lang,
  messages,
  publicLangs,
  langNav,
}: {
  children: React.ReactNode
  initialCookieDistro?: Distro
  initialReadingPrefs: ReadingPreferences
  lang: Lang
  /** The client strings of a language other than English; English has none. */
  messages?: Translations
  publicLangs: readonly Lang[]
  /** The language switch, server-rendered once a second language is public. */
  langNav?: React.ReactNode
}) {
  return (
    <LangProvider lang={lang} messages={messages} publicLangs={publicLangs}>
      <ThemeProvider>
        <ReadingPrefsProvider initialPrefs={initialReadingPrefs}>
          <DistroProvider initialCookieDistro={initialCookieDistro}>
            <TocProvider>
              <AppShell langNav={langNav}>{children}</AppShell>
            </TocProvider>
          </DistroProvider>
        </ReadingPrefsProvider>
      </ThemeProvider>
    </LangProvider>
  )
}
