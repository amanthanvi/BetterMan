import type { Metadata } from 'next'
import { headers } from 'next/headers'

import { EXPLAIN_LIMITS } from '../../../convex/_shellParser'
import { ExplainInput } from '../../components/explain/ExplainInput'
import { ExplainNote } from '../../components/explain/ExplainNote'
import { ExplainTokens, type TokenCellView } from '../../components/explain/ExplainTokens'
import { ExplainReading, SafetyNote } from '../../components/explain/ExplainVoice'
import { ExplainUsed } from '../../components/explain/ExplainUsed'
import { PortabilityLegend } from '../../components/man/Portability'
import { fetchExplanation, fetchPortabilityCells, withDistroFallback, type PortabilityCells } from '../../lib/api'
import { withDistro } from '../../lib/distro'
import { explainFacts, noteId, numberTokens, optionAnchorsByPage, readingLines, tokenCells, tokenLabel, type NumberedToken } from '../../lib/explain'
import { getI18n, type ServerT } from '../../lib/i18n/server'
import { localizedSeo } from '../../lib/i18n/seo'
import { isRateLimited } from '../../lib/rateLimit'
import { explicitDistro, explicitLang, getFirst, resolveRequestDistro, resolveRequestLang, type SearchParams } from '../../lib/requestContext'

/** At most this many manuals per line get portability cells: one bounded read each. */
const PORTABILITY_PAGES = 4

const PICKS = ['tar -xzvf backup.tar.gz -C /srv/www', "find . -name '*.log' -mtime +7 -print0 | xargs -0 rm -f", 'sudo rm -rf build/']

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const { t, lang } = await getI18n(resolveRequestLang(await searchParams))
  return {
    title: t('{title} — BetterMan', { title: t('Explain a command line') }),
    description: t('Paste a shell command line to see each token matched to its definition in the manual.'),
    robots: { index: false, follow: true },
    ...localizedSeo(lang, '/explain'),
  }
}

function cellView(cell: ReturnType<typeof tokenCells>[number], t: ServerT): TokenCellView {
  const kinds = new Set(cell.tokens.map((token) => token.kind))
  const single = cell.tokens.length === 1
  return {
    text: cell.text,
    kind: single ? cell.tokens[0].kind : 'cluster',
    label: single
      ? tokenLabel(cell.tokens[0], t)
      : kinds.size === 1 && kinds.has('option')
        ? t('{count} flags, clustered', { count: cell.tokens.length })
        : [...new Set(cell.tokens.map((token) => tokenLabel(token, t)))].join(', '),
    tokens: cell.tokens.map((token) => ({ n: token.n, value: token.kind === 'option' || token.kind === 'optionArgument' ? token.value : token.text })),
  }
}

async function portabilityFor(tokens: NumberedToken[], distro: Parameters<typeof fetchPortabilityCells>[0]['distro']) {
  const pages = optionAnchorsByPage(tokens).slice(0, PORTABILITY_PAGES)
  const results = await Promise.all(pages.map((page) => fetchPortabilityCells({ distro, ...page })))
  const byPage = new Map<string, PortabilityCells>()
  pages.forEach((page, index) => {
    const result = results[index]
    if (result) byPage.set(`${page.name}(${page.section})`, result)
  })
  return byPage
}

export default async function ExplainPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const cmd = getFirst(sp.cmd) ?? ''
  const urlDistro = explicitDistro(sp)
  const urlLang = explicitLang(sp)
  const { t } = await getI18n(resolveRequestLang(sp))
  const requestedDistro = await resolveRequestDistro(sp)
  const wanted = cmd.trim() ? cmd : ''

  let body: React.ReactNode = null
  if (wanted) {
    if (await isRateLimited(await headers(), 'search')) {
      body = <p className="mt-8 font-serif text-lg italic text-ink-2">{t('Too many explanations at once. Try again in a minute.')}</p>
    } else {
      const { distro, data: result } = await withDistroFallback(requestedDistro, (distro) => fetchExplanation({ distro, cmd: wanted })).catch(() => ({
        distro: requestedDistro,
        data: { kind: 'unavailable' as const },
      }))
      if (result.kind === 'limit') {
        body = (
          <p className="mt-8 font-serif text-lg italic text-ink-2">
            {t('This line is longer than BetterMan explains: at most {characters} characters, {tokens} words, {stages} commands and {depth} levels of nesting.', {
              characters: EXPLAIN_LIMITS.characters.toLocaleString(),
              tokens: EXPLAIN_LIMITS.tokens,
              stages: EXPLAIN_LIMITS.stages,
              depth: EXPLAIN_LIMITS.depth,
            })}
          </p>
        )
      } else if (result.kind === 'unavailable') {
        body = <p className="mt-8 font-serif text-lg italic text-ink-2">{t('Explanations are unavailable right now. Try again shortly.')}</p>
      } else {
        const tokens = numberTokens(result.data, urlDistro, urlLang)
        const portability = await portabilityFor(tokens, distro)
        const cellsFor = (token: NumberedToken) => (token.page ? portability.get(`${token.page.name}(${token.page.section})`) ?? null : null)
        const hasCells = tokens.some((token) => token.kind === 'option' && token.anchor && cellsFor(token)?.cells[token.anchor])
        body = (
          <>
            <ExplainUsed />
            <ExplainReading lines={readingLines(tokens)} diagnostics={result.data.diagnostics} t={t} />
            <section aria-label={t('Explanation')} className="bm-xfig mt-8">
              <ExplainTokens cells={tokenCells(tokens).map((cell) => cellView(cell, t))} />
              {hasCells ? (
                <div className="mt-8">
                  <PortabilityLegend everyFlag t={t} />
                </div>
              ) : null}
              <ol aria-label={t('Definitions')} className="mt-6 border-b border-rule">
                {tokens.map((token) => (
                  <li key={token.n} id={noteId(token.n)} className="bm-xn border-t border-rule py-4 pl-10 md:pl-12">
                    <div data-bm-note-body>
                      <ExplainNote token={token} portability={cellsFor(token)} t={t} />
                    </div>
                  </li>
                ))}
              </ol>
            </section>
            <SafetyNote facts={explainFacts(result.data)} t={t} />
            <p className="mt-10 max-w-xl text-xs text-ink-3">
              {t('Where a manual defines a token, its note quotes that definition and names the manual; flags in a cluster are split. Nothing is run, expanded or looked up on your system.')}
            </p>
          </>
        )
      }
    }
  }

  return (
    <div className="mx-auto max-w-[46rem] pt-8 md:pt-10">
      <h1 className="sr-only">{t('Explain a command line')}</h1>
      <form action="/explain" method="get" role="search" aria-label={t('Explain a command line')} className="flex items-end gap-4">
        <ExplainInput initial={wanted} maxLength={EXPLAIN_LIMITS.characters} />
        {urlDistro ? <input type="hidden" name="distro" value={urlDistro} /> : null}
        {urlLang ? <input type="hidden" name="lang" value={urlLang} /> : null}
        <button type="submit" className="shrink-0 pb-2 text-sm text-ink underline decoration-rule-2 underline-offset-[3px] hover:text-accent">
          {t('Explain')}
        </button>
      </form>
      {wanted ? null : (
        <p className="mt-3 text-sm text-ink-3">
          {t('Try')}{' '}
          {PICKS.map((pick, index) => (
            <span key={pick}>
              {index ? ' · ' : null}
              <a href={withDistro(`/explain?cmd=${encodeURIComponent(pick)}`, urlDistro, urlLang)} className="font-mono text-ink-2 underline decoration-rule-2 underline-offset-[3px] hover:text-accent">
                {pick}
              </a>
            </span>
          ))}
        </p>
      )}
      {body}
    </div>
  )
}
