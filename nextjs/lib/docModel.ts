import type { components } from './openapi.gen'

type Schemas = components['schemas']

export type ApiErrorEnvelope = { error: Schemas['ErrorDetail'] }

export type TocItem = Schemas['TocItem']
export type InlineNode = Schemas['InlineNode']
export type BlockNode = Schemas['BlockNode']

export type DefinitionListItem = Schemas['DefinitionListItem']
export type DocumentModel = Pick<Schemas['ManPageContent'], 'toc' | 'blocks'>

export type OptionItem = Schemas['OptionItem']
export type SeeAlsoRef = Schemas['SeeAlsoRef']

export type ManPage = Schemas['ManPage']
export type ManPageContent = Schemas['ManPageContent']
export type ManPageVariant = Schemas['ManPageVariant']
export type ManPageResponse = Schemas['ManPageResponse']

export type AmbiguousOption = Schemas['AmbiguousOption']
export type AmbiguousPageResponse = Schemas['AmbiguousPageResponse']
