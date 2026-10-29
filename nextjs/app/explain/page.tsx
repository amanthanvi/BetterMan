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
import { explainFacts, noteId, numberTokens, optionAnchorsByPage, readingLines, tokenCells, type NumberedToken } from '../../lib/explain'
import { isRateLimited } from '../../lib/rateLimit'
import { explicitDistro, getFirst, resolveRequestDistro, type SearchParams } from '../../lib/requestContext'

/** At most this many manuals per line get portability cells: one bounded read each. */
const PORTABILITY_PAGES = 4

const PICKS = ['tar -xzvf backup.tar.gz -C /srv/www', "find . -name '*.log' -mtime +7 -print0 | xargs -0 rm -f", 'sudo rm -rf build/']

export const metadata: Metadata = {
  title: 'Explain a command line — BetterMan',
  description: 'Paste a shell command line to see each token matched to its definition in the manual.',
  robots: { index: false, follow: true },
}

function cellView(cell: ReturnType<typeof tokenCells>[number]): TokenCellView {
  const kinds = new Set(cell.tokens.map((token) => token.kind))
  const single = cell.tokens.length === 1
  return {
    text: cell.text,
    kind: single ? cell.tokens[0].kind : 'cluster',
    label: single
      ? cell.tokens[0].label
      : kinds.size === 1 && kinds.has('option')
        ? `${cell.tokens.length} flags, clustered`
        : [...new Set(cell.tokens.map((token) => token.label))].join(', '),
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
  const requestedDistro = await resolveRequestDistro(sp)
  const wanted = cmd.trim() ? cmd : ''

  let body: React.ReactNode = null
  if (wanted) {
    if (await isRateLimited(await headers(), 'search')) {
      body = <p className="mt-8 font-serif text-lg italic text-ink-2">Too many explanations at once. Try again in a minute.</p>
    } else {
      const { distro, data: result } = await withDistroFallback(requestedDistro, (distro) => fetchExplanation({ distro, cmd: wanted })).catch(() => ({
        distro: requestedDistro,
        data: { kind: 'unavailable' as const },
      }))
      if (result.kind === 'limit') {
        body = (
          <p className="mt-8 font-serif text-lg italic text-ink-2">
            This line is longer than BetterMan explains: at most {EXPLAIN_LIMITS.characters.toLocaleString()} characters,{' '}
            {EXPLAIN_LIMITS.tokens} words, {EXPLAIN_LIMITS.stages} commands and {EXPLAIN_LIMITS.depth} levels of nesting.
          </p>
        )
      } else if (result.kind === 'unavailable') {
        body = <p className="mt-8 font-serif text-lg italic text-ink-2">Explanations are unavailable right now. Try again shortly.</p>
      } else {
        const tokens = numberTokens(result.data, urlDistro)
        const portability = await portabilityFor(tokens, distro)
        const cellsFor = (token: NumberedToken) => (token.page ? portability.get(`${token.page.name}(${token.page.section})`) ?? null : null)
        const hasCells = tokens.some((token) => token.kind === 'option' && token.anchor && cellsFor(token)?.cells[token.anchor])
        body = (
          <>
            <ExplainUsed />
            <ExplainReading lines={readingLines(tokens)} diagnostics={result.data.diagnostics} />
            <section aria-label="Explanation" className="bm-xfig mt-8">
              <ExplainTokens cells={tokenCells(tokens).map(cellView)} />
              {hasCells ? (
                <div className="mt-8">
                  <PortabilityLegend everyFlag />
                </div>
              ) : null}
              <ol aria-label="Definitions" className="mt-6 border-b border-rule">
                {tokens.map((token) => (
                  <li key={token.n} id={noteId(token.n)} className="bm-xn border-t border-rule py-4 pl-10 md:pl-12">
                    <div data-bm-note-body>
                      <ExplainNote token={token} portability={cellsFor(token)} />
                    </div>
                  </li>
                ))}
              </ol>
            </section>
            <SafetyNote facts={explainFacts(result.data)} />
            <p className="mt-10 max-w-xl text-xs text-ink-3">
              Each token is matched to its exact definition in the manual named beside it; flags in a cluster are split.
              Nothing is run, expanded or looked up on your system.
            </p>
          </>
        )
      }
    }
  }

  return (
    <div className="mx-auto max-w-[46rem] pt-8 md:pt-10">
      <h1 className="sr-only">Explain a command line</h1>
      <form action="/explain" method="get" role="search" aria-label="Explain a command line" className="flex items-end gap-4">
        <ExplainInput initial={wanted} maxLength={EXPLAIN_LIMITS.characters} />
        {urlDistro ? <input type="hidden" name="distro" value={urlDistro} /> : null}
        <button type="submit" className="shrink-0 pb-2 text-sm text-ink underline decoration-rule-2 underline-offset-[3px] hover:text-accent">
          Explain
        </button>
      </form>
      {wanted ? null : (
        <p className="mt-3 text-sm text-ink-3">
          Try{' '}
          {PICKS.map((pick, index) => (
            <span key={pick}>
              {index ? ' · ' : null}
              <a href={withDistro(`/explain?cmd=${encodeURIComponent(pick)}`, urlDistro)} className="font-mono text-ink-2 underline decoration-rule-2 underline-offset-[3px] hover:text-accent">
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
