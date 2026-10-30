import type { TopHit as TopHitData } from '../../lib/api'
import { briefSourceLabel } from '../../lib/briefSource'
import { manPageHref, withDistro, type Distro } from '../../lib/distro'
import type { Lang } from '../../lib/i18n/locales'
import type { ClientT } from '../../lib/i18n/server'

const LINK = 'underline decoration-rule-2 underline-offset-[3px] hover:text-accent'

/**
 * The top hit's answer (fix 13): one worked example with its gloss and source,
 * an "Explain this line" link (fix 14), then the key flags. BetterMan's voice,
 * on the added tint. Every string is rendered as text (docs/generated-layer.md).
 */
export function TopHit({ top, urlDistro, urlLang, t }: { top: TopHitData; urlDistro: Distro | null; urlLang: Lang | null; t: ClientT }) {
  const { example } = top
  return (
    <div className="bm-added mt-2.5 px-4 py-3 text-sm max-sm:-mx-5 max-sm:px-5" data-bm-top-hit>
      {example ? (
        <>
          {example.description ? <p className="text-ink">{example.description}</p> : null}
          <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <code className="min-w-0 font-mono text-[0.9375rem] break-all text-ink">
              <span className="text-ink-3 select-none" aria-hidden="true">
                ${' '}
              </span>
              {example.command}
            </code>
            <span className="text-xs text-ink-3">
              ·{' '}
              {example.attribution ? (
                <>
                  <a href={example.attribution.url} className={LINK} rel="noreferrer" target="_blank">
                    tldr-pages
                  </a>
                  ,{' '}
                  <a href={example.attribution.licenseUrl} className={LINK} rel="license noreferrer" target="_blank" title={example.attribution.modified}>
                    CC BY 4.0
                  </a>
                  , {t('adapted')}
                </>
              ) : (
                briefSourceLabel(example.source, t)
              )}
            </span>
          </p>
          <p className="mt-1.5">
            <a href={withDistro(`/explain?cmd=${encodeURIComponent(example.command)}`, urlDistro, urlLang)} className={`text-ink ${LINK}`}>
              {t('Explain this line')}
            </a>
          </p>
        </>
      ) : null}
      {top.flags.length ? (
        <ul aria-label={t('Key flags of {citation}', { citation: `${top.name}(${top.section})` })} className={example ? 'mt-2.5 border-t border-rule pt-2.5' : ''}>
          {top.flags.map((flag) => (
            <li key={flag.anchorId} className="flex min-w-0 items-baseline gap-2.5">
              <a href={manPageHref(top.name, top.section, urlDistro, flag.anchorId, urlLang)} className="shrink-0 font-mono font-semibold text-ink no-underline hover:text-accent">
                {flag.flag}
              </a>
              <span className="truncate text-ink-2">{flag.excerpt}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {top.package ? (
        <p className="mt-2 text-xs text-ink-3">
          {t('Package')}{' '}
          <a href={withDistro(`/pkg/${encodeURIComponent(top.package)}`, urlDistro, urlLang)} aria-label={t('Package {name}', { name: top.package })} className={`font-mono ${LINK}`}>
            {top.package}
          </a>
        </p>
      ) : null}
    </div>
  )
}
