import { codeSpans } from '../../lib/explain'
import type { ServerT } from '../../lib/i18n/server'

/**
 * BetterMan's voice on the explain page, on the added tint: the reading (each
 * command's own NAME line, in order) and the engine's command-level facts. The
 * facts are rendered exactly as the engine returns them; this file adds none.
 */
export function ExplainReading({
  lines,
  diagnostics,
  t,
}: {
  lines: Array<{ n: number; name: string; section: string; href: string; excerpt: string }>
  diagnostics: string[]
  t: ServerT
}) {
  if (!lines.length && !diagnostics.length) return null
  return (
    <section aria-label={t('Reading')} className="bm-added mt-6 px-5 py-4 max-md:-mx-5">
      {lines.length ? (
        <ol className="text-md leading-[1.5]">
          {lines.map((line) => (
            <li key={line.n}>
              <a href={line.href} className="no-underline hover:text-accent">
                <b className="font-semibold">{line.name}</b>({line.section})
              </a>
              {line.excerpt ? <span className="text-ink-2"> {line.excerpt}</span> : null}
            </li>
          ))}
        </ol>
      ) : null}
      {lines.length ? <p className="mt-2 text-xs text-ink-3">{t('Each command’s line comes from its manual’s NAME section.')}</p> : null}
      {diagnostics.length ? (
        <div className={lines.length ? 'mt-3 border-t border-rule pt-3' : ''}>
          <p className="text-sm text-ink-2">
            {t('BetterMan does not fully model this line, so it gives no safety notes for it:')}
          </p>
          <ul className="mt-1 list-disc pl-5 text-sm text-ink-2">
            {diagnostics.map((message, index) => (
              <li key={index}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

export function SafetyNote({ facts, t }: { facts: Array<{ description: string; dryRun: string | null }>; t: ServerT }) {
  if (!facts.length) return null
  return (
    <aside aria-label={t('Safety note')} className="bm-added bm-safety mt-8 px-5 py-4 max-md:-mx-5">
      <p className="text-sm font-semibold text-ink">{t('Before you run this')}</p>
      <ul className="mt-1.5 text-[0.9375rem] leading-[1.55]">
        {facts.map((fact) => (
          <li key={fact.description} className="mt-1">
            {fact.description}
            {fact.dryRun ? (
              <>
                {' '}
                {codeSpans(fact.dryRun).map((part, index) =>
                  part.code ? (
                    <code key={index} className="font-mono text-[0.9em]">
                      {part.text}
                    </code>
                  ) : (
                    <span key={index}>{part.text}</span>
                  ),
                )}
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </aside>
  )
}
