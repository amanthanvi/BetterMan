import type { ManPageSection, SeeAlsoItem } from './man-parser'

export interface ManPageFlag {
  flag: string
  shortFlag?: string
  description: string
  argument?: string
  required?: boolean
  deprecated?: boolean
  optional?: boolean
}

export interface ManPageExample {
  command: string
  description: string
  output?: string
  tags?: string[]
}

export interface ManPageMetadata {
  date: string
  source: string
  manual: string
  version?: string
  author?: string
}

export interface EnhancedManPage {
  // Basic info from ManPage
  name: string
  section: number
  title: string
  description: string
  synopsis: string
  category: string
  
  // Enhanced content
  sections: ManPageSection[]
  flags: ManPageFlag[]
  examples: ManPageExample[]
  relatedCommands: string[]
  seeAlso: SeeAlsoItem[]
  
  // Additional metadata
  metadata: ManPageMetadata
  searchContent: string
  keywords: string[]
  complexity: 'basic' | 'intermediate' | 'advanced'
  
  // Parse metadata
  hash: string
  parsedAt: string
  parseVersion: string
  
  // Features
  isCommon: boolean
  hasInteractiveExamples: boolean
  hasDiagrams: boolean
}

export interface EnhancedSearchResult {
  page: EnhancedManPage
  score: number
  highlights: {
    title?: string
    description?: string
    content?: string[]
  }
  matchedSections: string[]
  matchedFlags: string[]
  matchedExamples: number[]
}

export interface SearchFilters {
  sections?: number[]
  categories?: string[]
  complexity?: ('basic' | 'intermediate' | 'advanced')[]
  hasExamples?: boolean
  hasFlags?: boolean
  isCommon?: boolean
}

export interface SearchOptions {
  query: string
  filters?: SearchFilters
  limit?: number
  offset?: number
  fuzzy?: boolean
  includeScore?: boolean
}