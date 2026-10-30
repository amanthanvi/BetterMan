/**
 * Document model produced by the ingestion pipeline.
 *
 * The Python side is `ingestion/ingestion/doc_model.py`. Both sides are
 * checked against the golden fixtures under `ingestion/tests/fixtures/golden`
 * and `components/doc/__fixtures__`; change them together.
 */

export type TextInline = { type: 'text'; text: string }
export type CodeInline = { type: 'code'; text: string }
export type EmphasisInline = { type: 'emphasis'; inlines: InlineNode[] }
export type StrongInline = { type: 'strong'; inlines: InlineNode[] }
export type LinkInline = {
  type: 'link'
  href: string
  inlines: InlineNode[]
  linkType: 'internal' | 'external' | 'unresolved'
}
export type InlineNode = TextInline | CodeInline | EmphasisInline | StrongInline | LinkInline

export type HeadingBlock = { type: 'heading'; id: string; level: number; text: string }
export type ParagraphBlock = { type: 'paragraph'; inlines: InlineNode[] }
export type ListBlock = { type: 'list'; ordered: boolean; items: BlockNode[][] }
export type DefinitionListItem = {
  id?: string | null
  termInlines: InlineNode[]
  definitionBlocks: BlockNode[]
}
export type DefinitionListBlock = { type: 'definition_list'; items: DefinitionListItem[] }
export type CodeBlock = { type: 'code_block'; id?: string | null; languageHint?: string | null; text: string }
export type TableBlock = { type: 'table'; headers: string[]; rows: string[][] }
export type HorizontalRuleBlock = { type: 'horizontal_rule' }
export type BlockNode =
  | HeadingBlock
  | ParagraphBlock
  | ListBlock
  | DefinitionListBlock
  | CodeBlock
  | TableBlock
  | HorizontalRuleBlock

export type TocItem = { id: string; level: number; title: string }
export type DocumentModel = { toc: TocItem[]; blocks: BlockNode[] }

export type OptionItem = { anchorId: string; flags: string; argument?: string | null; description: string }
export type SeeAlsoRef = { name: string; section?: string | null; resolvedPageId?: string | null }

export type ManPage = {
  indexable?: boolean
  id: string
  datasetReleaseId: string
  locale: string
  distro: string
  name: string
  section: string
  title: string
  description: string
  sourcePackage?: string | null
  sourcePackageVersion?: string | null
  hasParseWarnings?: boolean
}

export type ManPageContent = {
  blocks: BlockNode[]
  toc: TocItem[]
  options?: OptionItem[] | null
  seeAlso?: SeeAlsoRef[] | null
  synopsis?: string[] | null
}

export type ManPageVariant = { distro: string; datasetReleaseId: string; contentSha256: string }

/**
 * Answer-first data built at ingest (convex/_generatedLayer.ts). Examples are
 * ordered page EXAMPLES, tldr-pages, then generated, five at most. Omit any
 * part that is missing. `placeholders` are [start, end) spans of `command`.
 * Every string is plain text: render it as React text, never through
 * dangerouslySetInnerHTML or a markdown renderer (docs/generated-layer.md).
 */
export type BriefExampleSource = 'page' | 'tldr' | 'generated'
export type BriefExample = {
  source: BriefExampleSource
  description: string
  command: string
  placeholders?: number[][]
  /** tldr-pages items: show the source link and CC BY 4.0 with the change notice. */
  attribution?: { name: 'tldr-pages'; url: string; license: 'CC-BY-4.0'; licenseUrl: string; modified: string }
}
export type ManPageBrief = {
  summary: string | null
  examples: BriefExample[]
  taskPhrases: string[]
  tldr: { path: string; commit: string; url: string; license: 'CC-BY-4.0' } | null
  generated: { provider: string; model: string; promptVersion: string; generatedAt: string } | null
}

// Response enrichment is separate from the upstream Python/TS document model.
export type ManPageResponse = {
  page: ManPage; content: ManPageContent; variants: ManPageVariant[]
  derived?: import('../../convex/_derivedEncoding').PageDerivedResponse
  brief?: ManPageBrief | null
  providers?: import('../../convex/lib').ManProviders | null
  /** Translated pages (#395): how the translation lags its English page, computed after activation. */
  translationDrift?: import('../../convex/translationDrift').PageTranslationDrift
  /** The drift build for the current English release is unfinished: cache this page briefly. */
  translationDriftPending?: true
}

export type ErrorDetail = { code: string; message: string }
export type ApiErrorEnvelope = { error: ErrorDetail }
export type AmbiguousOption = { section: string; title: string; description: string }
export type AmbiguousPageResponse = { error: ErrorDetail; options: AmbiguousOption[] }
