import type { Distro } from '../../lib/distro'
import { canonicalWithDistro, DISTRO_LABEL, DISTRO_ORDER, normalizeDistro } from '../../lib/distro'
import type { ManPage, ManPageResponse, ManPageVariant } from '../../lib/docModel'
import { withLang, type Lang } from '../../lib/i18n/locales'
import type { ServerT } from '../../lib/i18n/server'
import { ACTION_CLASS } from '../ui/action'
import { ManSectionLabel } from './RunningHead'

function buildVariantPicker(variants: ManPageVariant[]): { ordered: ManPageVariant[] } | null {
  const list = Array.isArray(variants) ? variants : []
  const uniqueContent = new Set(list.map((v) => v.contentSha256))
  if (list.length < 2) return null
  if (uniqueContent.size < 2) return null

  const ordered = [...list].sort((a, b) => (DISTRO_ORDER[a.distro as Distro] ?? 99) - (DISTRO_ORDER[b.distro as Distro] ?? 99))
  return { ordered }
}

/**
 * Title, lede, system picker, source package and page actions, then SYNOPSIS.
 * Plain server HTML: the man page script (man-client/) binds the actions by
 * their `data-bm-action` and the picker by `data-bm-distro-select`.
 */
export function ManPageHeaderCard({
  page,
  synopsis,
  contentLang,
  variants,
  providers,
  distro,
  hasToc,
  urlLang,
  t,
}: {
  page: ManPage
  synopsis?: string[] | null
  /** A translated manual's language (#395): its description and synopsis only. */
  contentLang?: string
  variants: ManPageVariant[]
  providers?: ManPageResponse['providers']
  distro: Distro
  hasToc: boolean
  urlLang: Lang | null
  t: ServerT
}) {
  const variantPicker = buildVariantPicker(variants)
  const citation = `${page.name}(${page.section})`

  return (
    <header>
      <h1 className="break-words font-serif text-3xl font-semibold tracking-[-0.015em] md:text-4xl">
        {page.name}
        <span className="ml-[0.08em] text-[0.5em] font-normal tracking-normal text-ink-3 oldstyle-nums">({page.section})</span>
      </h1>
      {page.description ? (
        <p lang={contentLang} className="bm-lede mt-2.5 max-w-text font-serif text-lg italic text-ink-2 md:text-[1.375rem] md:leading-[1.35]">
          {page.description}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm text-ink-2">
        {variantPicker ? (
          <label className="inline-flex items-baseline gap-2 print:hidden">
            <span className="text-ink-3">{t('System')}</span>
            {/* Choosing a system loads that variant's URL; without JavaScript the select shows what is served.
                bg-paper, not bg-transparent: Chromium draws the dropdown as its own page with a
                white body and copies this element's computed background-color and color onto
                the list, so a transparent select shows dark-theme ink on white. */}
            <select
              name="distro"
              defaultValue={distro}
              data-bm-distro-select
              autoComplete="off"
              className="border-0 border-b border-rule-2 bg-paper py-0.5 text-sm text-ink hover:border-accent"
              aria-label={t('Select distribution variant')}
            >
              {variantPicker.ordered.map((v) => {
                const normalized = normalizeDistro(v.distro)
                if (!normalized) return null
                return (
                  <option key={v.distro} value={normalized}>
                    {DISTRO_LABEL[normalized]}
                  </option>
                )
              })}
            </select>
          </label>
        ) : (
          <span className="text-ink">{DISTRO_LABEL[distro]}</span>
        )}

        {page.sourcePackage && (!providers || providers.packages.length < 2) ? (
          <span className="min-w-0 max-w-full break-words font-mono text-xs" title={t('Source package')}>
            {page.sourcePackage}
            {page.sourcePackageVersion ? ` ${page.sourcePackageVersion}` : null}
          </span>
        ) : null}

        {/* Inline and balanced, so a narrow screen wraps the actions evenly rather than orphaning the last. */}
        <div className="bm-js leading-7 text-balance md:ml-auto [&>*:not(:last-child)]:mr-5">
          {hasToc ? (
            <button type="button" data-bm-action="contents" aria-label={t('Open contents')} title={t('Contents (b)')} className={`${ACTION_CLASS} lg:hidden`}>
              {t('Contents')}
            </button>
          ) : null}
          <button type="button" data-bm-action="find" aria-label={t('man.findLabel\u0004Find in page')} title={t('Find in page (f)')} className={ACTION_CLASS}>
            {t('Find')}
          </button>
          <button type="button" data-bm-action="prefs" aria-label={t('man.prefsLabel\u0004Reading preferences')} title={t('Reading preferences (p)')} className={ACTION_CLASS}>
            {t('Preferences')}
          </button>
          <button
            type="button"
            data-bm-action="bookmark"
            data-bm-bookmark-name={page.name}
            data-bm-bookmark-section={page.section}
            data-bm-bookmark-description={page.description || page.title}
            aria-pressed="false"
            aria-label={t('Bookmark {citation}', { citation })}
            title={t('Bookmark: {citation} (m)', { citation })}
            className={ACTION_CLASS}
          >
            {t('Bookmark')}
            <span aria-hidden="true" data-bm-pressed-mark hidden className="ml-1 inline-block no-underline">
              ✓
            </span>
            <span aria-live="polite" className="sr-only" />
          </button>
          <button type="button" data-bm-action="copy-link" aria-label={t('Copy link to clipboard')} title={t('Copy link')} className={ACTION_CLASS}>
            {t('Copy link')}
            <span aria-hidden="true" data-bm-pressed-mark hidden className="bm-pop-in ml-1 inline-block text-accent no-underline motion-reduce:animate-none">
              ✓
            </span>
            <span aria-live="polite" className="sr-only" />
          </button>
        </div>
      </div>

      {providers && providers.packages.length > 1 ? (
        <details className="mt-3 text-sm text-ink-2" data-bm-providers>
          <summary className="w-fit cursor-pointer hover:text-accent">
            {t('Provided by')} <span className="font-mono text-xs">{page.sourcePackage}{page.sourcePackageVersion ? ` ${page.sourcePackageVersion}` : null}</span>
          </summary>
          {providers.defaultPackage ? (
            <p className="mt-2">
              {t('BetterMan’s default for this release.')}{' '}
              <a href="https://github.com/amanthanvi/BetterMan/blob/main/ingestion/README.md#provider-election" className="text-ink underline decoration-rule-2 underline-offset-4 hover:text-accent">{t('How the default is chosen')}</a>
            </p>
          ) : null}
          <ul aria-label={t('Package providers')} className="mt-2 space-y-1">
            {providers.packages.map((pkg) => (
              <li key={pkg}>
                <a
                  href={withLang(`${canonicalWithDistro(`/man/${encodeURIComponent(page.name)}/${encodeURIComponent(page.section)}`, distro)}${pkg === providers.defaultPackage ? '' : `${distro === 'debian' ? '?' : '&'}pkg=${encodeURIComponent(pkg)}`}`, urlLang)}
                  aria-current={pkg === page.sourcePackage ? 'page' : undefined}
                  className="font-mono text-xs text-ink underline decoration-rule-2 underline-offset-4 hover:text-accent"
                >{pkg}</a>
                {pkg === providers.defaultPackage ? ` · ${t('default')}` : null}
                {pkg === page.sourcePackage ? ` · ${t('shown')}` : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {synopsis?.length ? (
        <div className="mt-9">
          <ManSectionLabel as="h2">{t('SYNOPSIS')}</ManSectionLabel>
          <pre lang={contentLang} tabIndex={0} role="group" aria-label={t('Synopsis')} className="mt-1.5 overflow-x-auto pl-[1.75em] text-sm leading-[1.65]">
            <code>{synopsis.join('\n')}</code>
          </pre>
        </div>
      ) : null}
    </header>
  )
}
