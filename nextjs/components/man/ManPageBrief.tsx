import { briefSourceLabel } from '../../lib/briefSource'
import type { BriefExample, ManPageBrief } from '../../lib/docModel'
import type { ServerT } from '../../lib/i18n/server'
import { commandSegments, type BriefView } from '../../lib/manBrief'
import { CopyIcon } from '../icons'

/** "generated · deepseek-v4.1-flash, 2026-10-28": every model-written part carries it. */
function GeneratedMark({ generated, t }: { generated: ManPageBrief['generated']; t: ServerT }) {
  if (!generated) return null
  return (
    <span
      className="whitespace-nowrap text-xs text-ink-3"
      title={t('Written by {model} ({provider}, prompt {prompt}) and checked against this manual', { model: generated.model, provider: generated.provider, prompt: generated.promptVersion })}
    >
      {t('generated · {model}, {date}', { model: generated.model, date: generated.generatedAt })}
    </span>
  )
}

function ExampleSource({ example, generated, t }: { example: BriefExample; generated: ManPageBrief['generated']; t: ServerT }) {
  if (example.source === 'tldr' && example.attribution) {
    return (
      <span className="whitespace-nowrap text-xs text-ink-3">
        <a href={example.attribution.url} className="underline decoration-rule-2 underline-offset-2 hover:text-accent" target="_blank" rel="noopener noreferrer">
          tldr-pages
        </a>{' '}
        ·{' '}
        <a href={example.attribution.licenseUrl} className="underline decoration-rule-2 underline-offset-2 hover:text-accent" target="_blank" rel="noopener noreferrer">
          CC BY 4.0
        </a>
      </span>
    )
  }
  if (example.source === 'generated') return <GeneratedMark generated={generated} t={t} />
  return <span className="whitespace-nowrap text-xs text-ink-3">{briefSourceLabel(example.source, t)}</span>
}

/**
 * In brief: the summary, sourced examples and most-used flags, above the faithful
 * manual (FINAL-DIRECTION fixes 3-5). BetterMan's voice, so sans on the added tint.
 * Generated and tldr text is plain text: every string here renders as a text node.
 */
export function ManPageBriefSection({ view, t }: { view: BriefView; t: ServerT }) {
  const { summary, examples, flagGroups, generated } = view
  const tldrNotice = examples.find((example) => example.source === 'tldr' && example.attribution)?.attribution?.modified

  return (
    <section id="in-brief" data-bm-brief aria-labelledby="in-brief-heading" className="bm-added mb-12 px-5 pt-4 pb-4 max-md:-mx-5 md:px-8 md:pt-5">
      <h2 id="in-brief-heading" className="text-sm font-semibold text-ink">
        {t('In brief')} <span className="ml-1.5 font-normal text-ink-3">· {t('added by BetterMan, not part of the manual')}</span>
      </h2>

      {summary ? (
        <p className="mt-2 max-w-text text-base leading-snug text-ink">
          {summary} <GeneratedMark generated={generated} t={t} />
        </p>
      ) : null}

      {examples.length || flagGroups.length ? (
        <div className={`mt-4 grid gap-x-10 gap-y-5 ${examples.length && flagGroups.length ? 'md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]' : ''}`}>
          {examples.length ? (
            <div className="min-w-0">
              <h3 className="small-caps text-sm font-normal text-ink-3">{t('Examples')}</h3>
              <ol className="mt-1.5 space-y-2.5">
                {examples.map((example, index) => (
                  <li key={index}>
                    <p className="text-sm text-ink-2">
                      {example.description ? <>{example.description} </> : null}
                      <ExampleSource example={example} generated={generated} t={t} />
                    </p>
                    <div className="bm-code mt-1">
                      <button type="button" className="bm-copy bm-js" data-bm-action="copy-code" aria-label={t('Copy code block')} title={t('Copy')}>
                        <CopyIcon />
                      </button>
                      <pre tabIndex={0} role="group" aria-label={t('Example')}>
                        <code>
                          {commandSegments(example.command, example.placeholders).map((segment, i) =>
                            segment.placeholder ? <i key={i}>{segment.text}</i> : <span key={i}>{segment.text}</span>,
                          )}
                        </code>
                      </pre>
                    </div>
                  </li>
                ))}
              </ol>
              {tldrNotice ? <p className="mt-2 text-xs text-ink-3">{t('tldr-pages examples, modified: {notice}', { notice: tldrNotice })}</p> : null}
            </div>
          ) : null}

          {flagGroups.length ? (
            <div className="min-w-0">
              <h3 className="small-caps text-sm font-normal text-ink-3">{t('Most-used flags')}</h3>
              <p className="text-xs text-ink-3">{t('counted in the verified examples')}</p>
              {flagGroups.map((group, g) => (
                <div key={g} className="mt-1.5">
                  {group.label ? <p className="text-xs font-semibold text-ink-2">{t(group.label)}</p> : null}
                  <ul>
                    {group.flags.map((flag) => (
                      <li key={flag.anchorId} className="flex items-baseline gap-3 py-0.5 text-sm">
                        <a href={`#${flag.anchorId}`} className="shrink-0 font-mono text-[0.8125rem] font-bold text-ink no-underline hover:text-accent">
                          {flag.flag}
                          {flag.argument ? <i className="font-normal text-ink-2"> {flag.argument}</i> : null}
                        </a>
                        {flag.gloss ? <span className="min-w-0 text-ink-2">{flag.gloss}</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
