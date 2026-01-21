import type { components } from './openapi.gen'

type Schemas = components['schemas']

export type ApiErrorEnvelope = { error: Schemas['ErrorDetail'] }

export type InfoResponse = Schemas['InfoResponse']

export type SearchResult = Schemas['SearchResult']
export type SearchResponse = Schemas['SearchResponse']

export type Suggestion = Schemas['Suggestion']
export type SuggestResponse = Schemas['SuggestResponse']

export type SectionLabel = Schemas['SectionLabel']
export type SectionPage = Schemas['SectionPage']
export type SectionResponse = Schemas['SectionResponse']

export type LicensePackage = Schemas['LicensePackage']
export type LicensesResponse = Schemas['LicensesResponse']
export type LicenseTextResponse = Schemas['LicenseTextResponse']

export type TocItem = Schemas['TocItem']
export type InlineNode = Schemas['InlineNode']
export type BlockNode = Schemas['BlockNode']

export type OptionItem = Schemas['OptionItem']
export type SeeAlsoRef = Schemas['SeeAlsoRef']

export type ManPage = Schemas['ManPage']
export type ManPageContent = Schemas['ManPageContent']
export type DocumentModel = Pick<ManPageContent, 'toc' | 'blocks'>
export type ManPageVariant = Schemas['ManPageVariant']
export type ManPageResponse = Schemas['ManPageResponse']

export type AmbiguousOption = Schemas['AmbiguousOption']
export type AmbiguousPageResponse = Schemas['AmbiguousPageResponse']
export type RelatedResponse = Schemas['RelatedResponse']
