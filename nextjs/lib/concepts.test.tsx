import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ConceptText } from '../components/concept/ConceptText'
import { ManPageFooterSections } from '../components/man/ManPageFooterSections'
import { ConceptRow } from '../components/search/ConceptRow'
import { SearchResultsBody } from '../components/search/SearchResultsBody'
import type { SearchResult } from './api'
import {
  approvedConcepts,
  conceptDraftsEnabled,
  conceptLink,
  conceptReportHref,
  conceptsForPage,
  conceptSitemapXml,
  getConcept,
  matchConcepts,
  publishedConcepts,
  type Concept,
} from './concepts'
import data from './concepts.generated.json'
import type { BlockNode } from './docModel'

const ALL = (data as unknown as { concepts: Concept[] }).concepts
const DRAFTS = { BETTERMAN_CONCEPT_DRAFTS: '1' }
const bySlug = (slug: string) => ALL.find((c) => c.slug === slug)!
const approve = (concept: Concept): Concept => ({ ...concept, status: 'approved' })

const link = (href: string): BlockNode => ({ type: 'paragraph', inlines: [{ type: 'text', text: 'see ' }, { type: 'link', href, inlines: [{ type: 'text', text: 'x' }], linkType: 'internal' }] })

describe('publishing gate', () => {
  it('publishes nothing unapproved by default', () => {
    expect(publishedConcepts({})).toEqual(approvedConcepts())
    expect(getConcept('signals', {})).toBeNull()
  })

  it('shows drafts only when a non-production build opts in', () => {
    expect(conceptDraftsEnabled(DRAFTS)).toBe(true)
    expect(conceptDraftsEnabled({ ...DRAFTS, VERCEL_ENV: 'production' })).toBe(false)
    expect(conceptDraftsEnabled({ BETTERMAN_CONCEPT_DRAFTS: 'true' })).toBe(false)
    expect(getConcept('signals', DRAFTS)?.title).toBe('Signals')
    expect(publishedConcepts({ ...DRAFTS, VERCEL_ENV: 'production' }).map((c) => c.status)).not.toContain('pending-owner')
  })

  it('lists only approved explainers in the sitemap', () => {
    expect(conceptSitemapXml('https://betterman.sh', ALL.filter((c) => c.status !== 'approved'))).toBeNull()
    const xml = conceptSitemapXml('https://betterman.sh', [approve(bySlug('signals')), bySlug('globbing')])!
    expect(xml).toContain('<loc>https://betterman.sh/concept/signals</loc>')
    expect(xml).not.toContain('globbing')
  })
})

describe('the initial list', () => {
  it('anchors every explainer to cited manual pages and keeps it short', () => {
    expect(ALL.length).toBeGreaterThanOrEqual(15)
    expect(ALL.length).toBeLessThanOrEqual(25)
    for (const concept of ALL) {
      expect(concept.sources.length, concept.slug).toBeGreaterThan(0)
      expect(concept.words, concept.slug).toBeLessThanOrEqual(260)
      expect(concept.references.length + concept.headings.length + concept.pages.length, concept.slug).toBeGreaterThan(0)
    }
    expect(bySlug('signals').sources[0].page).toEqual({ name: 'signal', section: '7' })
    expect(bySlug('globbing').sources[0].page).toEqual({ name: 'glob', section: '7' })
    expect(bySlug('regular-expressions').sources[0].page).toEqual({ name: 'regex', section: '7' })
  })
})

describe('conceptsForPage', () => {
  const concepts = ALL.map(approve)
  const slugs = (page: { name: string; section: string }, content: Parameters<typeof conceptsForPage>[1]) =>
    conceptsForPage(page, content, concepts).map((c) => c.slug)

  it('finds a concept from a SEE ALSO citation or a cross-reference link to its section 7 page', () => {
    expect(slugs({ name: 'kill', section: '1' }, { blocks: [], toc: [], seeAlso: [{ name: 'signal', section: '7' }] })).toEqual(['signals'])
    expect(slugs({ name: 'find', section: '1' }, { blocks: [link('/man/glob/7')], toc: [] })).toEqual(['globbing'])
    expect(slugs({ name: 'find', section: '1' }, { blocks: [link('/man/glob/7?distro=arch')], toc: [] })).toEqual(['globbing'])
  })

  it('finds a concept from a section heading, the page itself, or a page the concept names', () => {
    expect(slugs({ name: 'grep', section: '1' }, { blocks: [], toc: [{ id: 'exit', level: 2, title: 'Exit status:' }] })).toEqual(['exit-status'])
    expect(slugs({ name: 'signal', section: '7' }, { blocks: [], toc: [] })).toEqual(['signals'])
    expect(slugs({ name: 'bash', section: '1' }, { blocks: [], toc: [] })).toEqual(['exit-status', 'pipelines', 'quoting', 'redirection'])
  })

  it('ignores text that only mentions a concept, and other sections of the same name', () => {
    const prose: BlockNode = { type: 'paragraph', inlines: [{ type: 'text', text: 'signal(7) globbing regex' }] }
    expect(slugs({ name: 'tar', section: '1' }, { blocks: [prose], toc: [], seeAlso: [{ name: 'signal', section: '2' }, { name: 'glob', section: null }] })).toEqual([])
  })

  it('surfaces nothing while no explainer is published', () => {
    expect(conceptsForPage({ name: 'kill', section: '1' }, { blocks: [], toc: [], seeAlso: [{ name: 'signal', section: '7' }] }, [])).toEqual([])
  })
})

describe('matchConcepts', () => {
  const concepts = ALL.map(approve)
  const match = (q: string) => matchConcepts(q, concepts).map((c) => c.slug)

  it('matches a slug, title, term or alias, singular or plural', () => {
    expect(match('signals')).toEqual(['signals'])
    expect(match('Signal')).toEqual(['signals'])
    expect(match('SIGTERM')).toEqual(['signals'])
    expect(match('regex')).toEqual(['regular-expressions'])
    expect(match('what is a pipe?')).toEqual(['pipelines'])
    expect(match('exit codes')).toEqual(['exit-status'])
    expect(match('$?')).toEqual(['exit-status'])
  })

  it('leaves command searches alone', () => {
    expect(match('kill -9')).toEqual([])
    expect(match('tar')).toEqual([])
    expect(match('s')).toEqual([])
  })

  it('matches nothing while no explainer is published', () => {
    expect(matchConcepts('signals', [])).toEqual([])
  })
})

describe('rendering', () => {
  const signals = conceptLink(approve(bySlug('signals')))

  it('puts a quiet Concepts line in the man page footer, outside the manual text', () => {
    const props = { reportHref: 'https://github.com/example/issues/new', urlDistro: null, relatedItems: [] }
    expect(renderToStaticMarkup(<ManPageFooterSections {...props} />)).not.toContain('Concepts')
    const html = renderToStaticMarkup(<ManPageFooterSections {...props} urlDistro="arch" concepts={[signals, conceptLink(bySlug('globbing'))]} />)
    expect(html).toContain('aria-label="Concepts"')
    expect(html).toContain('href="/concept/signals?distro=arch"')
    expect(html).toMatch(/Concepts: <a[^>]*>signals<\/a><span aria-hidden="true"> · <\/span><a[^>]*>globbing<\/a>/)
    expect(html).not.toContain('bm-added">Concepts')
  })

  it('labels an explainer in search as a concept and keeps the top hit first', () => {
    const results: SearchResult[] = [{ name: 'signal', section: '7', title: 'signal(7)', description: 'overview of signals' } as SearchResult]
    const html = renderToStaticMarkup(<SearchResultsBody q="signals" section="" results={results} suggestions={[]} urlDistro={null} concepts={[signals]} />)
    expect(html.indexOf('/man/signal/7')).toBeLessThan(html.indexOf('/concept/signals'))
    expect(renderToStaticMarkup(<ConceptRow concept={signals} urlDistro={null} />)).toMatch(/small-caps[^>]*>concept<\/span>[\s\S]*BetterMan explainer[\s\S]*signal\(7\)/)
    expect(renderToStaticMarkup(<SearchResultsBody q="signals" section="1" results={[]} suggestions={[]} urlDistro={null} concepts={[signals]} />)).not.toContain('/concept/')
    expect(renderToStaticMarkup(<SearchResultsBody q="signals" section="" results={[]} suggestions={[]} urlDistro={null} concepts={[signals]} />)).toContain('/concept/signals')
  })

  it('renders explainer text as text, linking citations and only published concepts', () => {
    const html = renderToStaticMarkup(
      <ConceptText
        urlDistro={null}
        published={new Set(['globbing'])}
        blocks={[
          { type: 'p', inlines: [{ t: 'man', name: 'kill', section: '1' }, { t: 'text', v: ' <b>x</b> ' }, { t: 'concept', slug: 'globbing', v: 'wildcards' }, { t: 'concept', slug: 'quoting', v: 'quoting' }] },
          { type: 'pre', text: '<script>alert(1)</script>' },
        ]}
      />,
    )
    expect(html).toContain('href="/man/kill/1"')
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(html).toContain('href="/concept/globbing"')
    expect(html).not.toContain('/concept/quoting')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('tabindex="0"')
  })

  it('prefills a report for one explainer', () => {
    const href = new URL(conceptReportHref(bySlug('signals'), 'https://betterman.sh'))
    expect(href.searchParams.get('title')).toBe('[Bug]: concept explainer “Signals”')
    expect(href.searchParams.get('what-happened')).toContain('https://betterman.sh/concept/signals')
  })
})
