export type TocItem = {
  id: string
  title: string
  level: number
}

export type ApiErrorEnvelope = {
  error: {
    code: string
    message: string
  }
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
  | { type: 'definition_list'; items: DefinitionListItem[] }
  | { type: 'code_block'; text: string; languageHint?: string | null; id?: string | null }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'horizontal_rule' }

export type DocumentModel = {
  toc: TocItem[]
  blocks: BlockNode[]
}

export type DefinitionListItem = {
  id?: string | null
  termInlines: InlineNode[]
  definitionBlocks: BlockNode[]
}

export type OptionItem = {
  flags: string
  argument: string | null
  description: string
  anchorId: string
}

export type SeeAlsoRef = {
  name: string
  section: string | null
  resolvedPageId: string | null
}

export type ManPage = {
  id: string
  locale: string
  distro: string
  name: string
  section: string
  title: string
  description: string
  sourcePackage: string | null
  sourcePackageVersion: string | null
  datasetReleaseId: string
}

export type ManPageContent = DocumentModel & {
  synopsis: string[] | null
  options: OptionItem[] | null
  seeAlso: SeeAlsoRef[] | null
}

export type ManPageVariant = {
  distro: string
  datasetReleaseId: string
  contentSha256: string
}

export type ManPageResponse = {
  page: ManPage
  content: ManPageContent
  variants: ManPageVariant[]
}

export type AmbiguousOption = {
  section: string
  title: string
  description: string
}

export type AmbiguousPageResponse = ApiErrorEnvelope & {
  options: AmbiguousOption[]
}
