import { LANG_NAMES, type Lang } from '../../lib/i18n/locales'

/**
 * The language switch: one link per public language, in its own name, and the current one marked.
 * The links go through `/-/lang/<code>` (lib/i18n/switch.ts), which remembers the choice, so the
 * switch needs no script and renders on the server for both kinds of page. Nothing renders until a
 * language beyond English is public.
 */
export function LangLinks({
  label,
  langs,
  current,
  hrefs,
}: {
  label: string
  langs: readonly Lang[]
  current: Lang
  hrefs: Readonly<Record<string, string>>
}) {
  if (langs.length < 2) return null
  return (
    <nav aria-label={label} data-bm-lang-nav className="flex flex-wrap items-baseline gap-x-3 [&>a]:underline">
      <span aria-hidden="true">{label}</span>
      {langs.map((lang) =>
        lang === current ? (
          <span key={lang} lang={lang} aria-current="true" className="text-ink">
            {LANG_NAMES[lang]}
          </span>
        ) : (
          <a key={lang} href={hrefs[lang]} lang={lang} rel="nofollow">
            {LANG_NAMES[lang]}
          </a>
        ),
      )}
    </nav>
  )
}
