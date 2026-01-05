export type ApiErrorEnvelope = {
  error: {
    code: string
    message: string
  }
}

export type InfoResponse = {
  datasetReleaseId: string
  locale: string
  pageCount: number
  lastUpdated: string
}

export type SearchResult = {
  name: string
  section: string
  title: string
  description: string
  highlights: string[]
}

export type SearchResponse = {
  query: string
  results: SearchResult[]
  suggestions: string[]
}

export type SectionLabel = {
  section: string
  label: string
}

export type SectionPage = {
  name: string
  section: string
  title: string
  description: string
}

export type SectionResponse = {
  section: string
  label: string
  limit: number
  offset: number
  total: number
  results: SectionPage[]
}

export type LicensePackage = {
  name: string
  version: string
  hasLicenseText: boolean
}

export type LicensesResponse = {
  datasetReleaseId: string
  ingestedAt: string
  imageRef: string
  imageDigest: string
  packageManifest: unknown | null
  packages: LicensePackage[]
}

export type LicenseTextResponse = {
  package: string
  licenseId: string
  licenseName: string
  text: string
}

export type TocItem = {
  id: string
  title: string
  level: number
}

export type InlineNode =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'emphasis'; inlines: InlineNode[] }
  | { type: 'strong'; inlines: InlineNode[] }
  | { type: 'link'; href: string; inlines: InlineNode[]; linkType: 'internal' | 'external' | 'unresolved' }

export type BlockNode =
  | { type: 'heading'; id: string; level: number; text: string }
  | { type: 'paragraph'; inlines: InlineNode[] }
  | { type: 'list'; ordered: boolean; items: BlockNode[][] }
  | {
      type: 'definition_list'
      items: { id?: string | null; termInlines: InlineNode[]; definitionBlocks: BlockNode[] }[]
    }
  | { type: 'code_block'; text: string; languageHint?: string | null; id?: string | null }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'horizontal_rule' }

export type DocumentModel = {
  toc: TocItem[]
  blocks: BlockNode[]
}

export type OptionItem = {
  flags: string
  argument?: string | null
  description: string
  anchorId: string
}

export type SeeAlsoRef = {
  name: string
  section?: string | null
  resolvedPageId?: string | null
}

export type ManPage = {
  id: string
  locale: string
  name: string
  section: string
  title: string
  description: string
  sourcePackage?: string | null
  sourcePackageVersion?: string | null
  datasetReleaseId: string
}

export type ManPageContent = DocumentModel & {
  synopsis?: string[]
  options?: OptionItem[]
  seeAlso?: SeeAlsoRef[]
}

export type ManPageResponse = {
  page: ManPage
  content: ManPageContent
}

export type AmbiguousOption = {
  section: string
  title: string
  description: string
}

export type AmbiguousPageResponse = ApiErrorEnvelope & {
  options: AmbiguousOption[]
}

export type RelatedResponse = {
  items: SectionPage[]
}
