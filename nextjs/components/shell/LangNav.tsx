import { fixLinkHref, langSwitchHref } from '../../lib/i18n/switch'
import type { Lang } from '../../lib/i18n/locales'
import type { ServerT } from '../../lib/i18n/server'
import { LangLinks } from './LangLinks'

/** The App Router footer's language switch and fix link, rendered by the server layout and handed to the shell as a node. */
export function LangNav({ t, lang, langs }: { t: ServerT; lang: Lang; langs: readonly Lang[] }) {
  if (langs.length < 2) return null
  return (
    <>
      <LangLinks label={t('Language')} langs={langs} current={lang} hrefs={Object.fromEntries(langs.map((code) => [code, langSwitchHref(code)]))} />
      {lang === 'en' ? null : (
        <a href={fixLinkHref(lang)} className="underline" target="_blank" rel="noopener noreferrer nofollow">
          {t('Suggest a fix for this translation')}
        </a>
      )}
    </>
  )
}
