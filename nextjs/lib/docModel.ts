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
  | { type: 'definition_list'; items: DefinitionListItem[] }
  | { type: 'code_block'; text: string; languageHint?: string | null; id?: string | null }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'horizontal_rule' }

export type DefinitionListItem = {
  id?: string | null
  termInlines: InlineNode[]
  definitionBlocks: BlockNode[]
}

