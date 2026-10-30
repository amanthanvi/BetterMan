import data from './concepts.generated.json'
import type { BlockNode, InlineNode, ManPageContent } from './docModel'
import { ISSUES_NEW_URL } from './reportProblem'

/**
 * Concept explainers (B8, #400): BetterMan's own short text over the manual's
 * section 7 pages, compiled from content/concepts/*.md by scripts/build-concepts.mjs.
 * Everything here is static data bundled at build time: surfacing a concept on
 * a man page or in search adds no Convex read to that page's own reads.
 */

export type ConceptRef = { name: string; section: string }
export type ConceptInline =
  | { t: 'text' | 'code' | 'em'; v: string }
  | { t: 'man'; name: string; section: string }
  | { t: 'concept'; slug: string; v: string }
export type ConceptBlock =
  | { type: 'p'; inlines: ConceptInline[] }
  | { type: 'ul' | 'ol'; items: ConceptInline[][] }
  | { type: 'pre'; text: string }
export type ConceptStatus = 'draft' | 'pending-owner' | 'approved'
export type ConceptSource = { page: ConceptRef; package: string | null; distros: string[]; sections: string }
export type Concept = {
  slug: string
  title: string
  /** The footer and search label: "signals", "globbing". */
  term: string
  summary: string
  status: ConceptStatus
  generatedBy: string
  generatedOn: string
  panelReview: string | null
  sources: ConceptSource[]
  related: ConceptRef[]
  aliases: string[]
  /** Section 7 pages whose citation means a man page references this concept. */
  references: ConceptRef[]
  /** Section headings (upper case) that mean the same, such as EXIT STATUS. */
  headings: string[]
  /** Pages that always show the concept, such as bash(1) for quoting. */
  pages: ConceptRef[]
  words: number
  body: ConceptBlock[]
}

/** What a page that names a concept needs to link to it. */
export type ConceptLink = Pick<Concept, 'slug' | 'term' | 'title' | 'summary'> & { sources: ConceptRef[] }
/** A search match, and whether it came from the concept's own name or only from an alias. */
export type ConceptMatch = ConceptLink & { via: 'name' | 'alias' }

const ALL = (data as unknown as { concepts: Concept[] }).concepts

/**
 * Drafts render only when BETTERMAN_CONCEPT_DRAFTS=1 and the server is positively
 * a place drafts may show: a Vercel development or preview deployment, or, off
 * Vercel, `next dev` or a CI run (`CI=true`). Production, and any server that
 * cannot say what it is (the Docker image), shows only `approved` explainers.
 */
export function conceptDraftsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.BETTERMAN_CONCEPT_DRAFTS !== '1') return false
  if (env.VERCEL_ENV) return env.VERCEL_ENV === 'development' || env.VERCEL_ENV === 'preview'
  return env.CI === 'true' || env.NODE_ENV === 'development'
}

export function publishedConcepts(env?: Record<string, string | undefined>, all: Concept[] = ALL): Concept[] {
  const drafts = conceptDraftsEnabled(env)
  return all.filter((concept) => concept.status === 'approved' || drafts)
}

/** Indexable explainers: approved ones only, whatever the build's draft setting. */
export function approvedConcepts(all: Concept[] = ALL): Concept[] {
  return all.filter((concept) => concept.status === 'approved')
}

/** The concept sitemap, or null while no explainer is approved. */
export function conceptSitemapXml(origin: string, all: Concept[] = ALL): string | null {
  const approved = approvedConcepts(all)
  if (!approved.length) return null
  const rows = approved.map((concept) => `  <url>\n    <loc>${origin}${conceptHref(concept.slug)}</loc>\n  </url>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows}\n</urlset>\n`
}

export function getConcept(slug: string, env?: Record<string, string | undefined>): Concept | null {
  return publishedConcepts(env).find((concept) => concept.slug === slug) ?? null
}

export function conceptLink(concept: Concept): ConceptLink {
  return { slug: concept.slug, term: concept.term, title: concept.title, summary: concept.summary, sources: concept.sources.map((s) => s.page) }
}

export function conceptHref(slug: string): string {
  return `/concept/${encodeURIComponent(slug)}`
}

const key = (name: string, section: string) => `${name.toLowerCase()}(${section.toLowerCase()})`
const MAN_HREF_RE = /^\/man\/([^/?#]+)\/([^/?#]+)/

function collectInlineRefs(inlines: InlineNode[], out: Set<string>) {
  for (const inline of inlines) {
    if (inline.type === 'link') {
      const m = MAN_HREF_RE.exec(inline.href)
      if (m) {
        try {
          out.add(key(decodeURIComponent(m[1]), decodeURIComponent(m[2])))
        } catch {}
      }
      collectInlineRefs(inline.inlines, out)
    } else if (inline.type === 'emphasis' || inline.type === 'strong') collectInlineRefs(inline.inlines, out)
  }
}

function collectBlockRefs(blocks: BlockNode[], refs: Set<string>, headings: Set<string>): void {
  for (const block of blocks) {
    switch (block.type) {
      case 'heading':
        headings.add(block.text.trim().replace(/:$/, '').toUpperCase())
        break
      case 'paragraph':
        collectInlineRefs(block.inlines, refs)
        break
      case 'list':
        for (const item of block.items) collectBlockRefs(item, refs, headings)
        break
      case 'definition_list':
        for (const item of block.items) {
          collectInlineRefs(item.termInlines, refs)
          collectBlockRefs(item.definitionBlocks, refs, headings)
        }
        break
    }
  }
}

/** The footer names at most this many explainers, the strongest references first. */
export const MAX_PAGE_CONCEPTS = 3

/**
 * The concepts a man page references, strongest first and at most three. In rank
 * order, a page references a concept when it is one of the concept's section 7
 * sources, when the concept names the page outright, when its SEE ALSO cites one of
 * the concept's pages, when a cross-reference link in its text does, or, weakest,
 * when it has one of the concept's section headings (EXIT STATUS). Ties keep the
 * concept list's order. Reads only the content already loaded for the page.
 */
export function conceptsForPage(
  page: { name: string; section: string },
  content: Pick<ManPageContent, 'blocks' | 'toc' | 'seeAlso'>,
  concepts: Concept[] = publishedConcepts(),
): ConceptLink[] {
  if (!concepts.length) return []
  const self = key(page.name, page.section)
  const seeAlso = new Set<string>()
  const links = new Set<string>()
  const headings = new Set<string>()
  for (const ref of content.seeAlso ?? []) if (ref.section) seeAlso.add(key(ref.name, ref.section))
  for (const item of content.toc ?? []) headings.add(item.title.trim().replace(/:$/, '').toUpperCase())
  collectBlockRefs(content.blocks, links, headings)
  const cites = (refs: Set<string>, concept: Concept) => concept.references.some((r) => refs.has(key(r.name, r.section)))
  const rank = (concept: Concept): number => {
    if (concept.sources.some((s) => s.page.section.startsWith('7') && key(s.page.name, s.page.section) === self)) return 0
    if (concept.pages.some((p) => key(p.name, p.section) === self)) return 1
    if (cites(seeAlso, concept)) return 2
    if (cites(links, concept)) return 3
    if (concept.headings.some((heading) => headings.has(heading))) return 4
    return -1
  }
  return concepts
    .map((concept, index) => ({ concept, index, rank: rank(concept) }))
    .filter((entry) => entry.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, MAX_PAGE_CONCEPTS)
    .map((entry) => conceptLink(entry.concept))
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[‘’“”"]/g, '').replace(/\s+/g, ' ').trim()
}

/** Singular and plural read alike: "signal" finds signals, "pipes" finds pipes and pipelines. */
function variants(text: string): string[] {
  const t = normalize(text)
  return t.endsWith('s') && t.length > 3 ? [t, t.slice(0, -1)] : [t, `${t}s`]
}

/** A query as matching compares it: lower case, without "what is" and a final question mark. */
export function normalizeConceptQuery(query: string): string {
  return normalize(query).replace(/^(?:what (?:is|are)|explain) (?:an? |the )?/, '').replace(/(?<=\w)\?$/, '').trim()
}

/**
 * Concepts a search names: the query is the concept's slug, title, term or one of
 * its aliases, optionally after "what is" / "what are". Exact phrases only, so a
 * command search such as `kill -9` is never answered with an explainer. Aliases
 * are conceptual phrases, never a command's name; see SearchResultsBody for how an
 * alias-only match yields to a command of that name.
 */
export function matchConcepts(query: string, concepts: Concept[] = publishedConcepts()): ConceptMatch[] {
  const q = normalizeConceptQuery(query)
  if (q.length < 2) return []
  const wanted = new Set(variants(q))
  const hit = (names: string[]) => names.some((name) => wanted.has(normalize(name)))
  return concepts
    .flatMap((concept): ConceptMatch[] => {
      if (hit([concept.slug.replace(/-/g, ' '), concept.title, concept.term])) return [{ ...conceptLink(concept), via: 'name' }]
      if (hit(concept.aliases)) return [{ ...conceptLink(concept), via: 'alias' }]
      return []
    })
    .slice(0, 3)
}

/** A new issue about one explainer, using the repository's bug form. */
export function conceptReportHref(concept: Pick<Concept, 'slug' | 'title' | 'generatedBy' | 'generatedOn'>, origin: string): string {
  const params = new URLSearchParams({
    template: 'bug_report.yml',
    title: `[Bug]: concept explainer “${concept.title}”`,
    'what-happened': [
      'What is wrong in this explainer?',
      '',
      '',
      '---',
      `Explainer: ${origin}${conceptHref(concept.slug)}`,
      `Generated: ${concept.generatedBy}, ${concept.generatedOn}`,
    ].join('\n'),
  })
  return `${ISSUES_NEW_URL}?${params}`
}
