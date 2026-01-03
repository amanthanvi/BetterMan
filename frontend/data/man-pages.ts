// Man page data structure - types only
// All actual data is fetched from the backend API at runtime

export interface SeeAlsoItem {
  name: string
  section: number
}

export interface ManPage {
  name: string
  section: number
  title: string
  description: string
  synopsis?: string
  category?: string
  isCommon?: boolean
  searchContent?: string
  sections?: Array<{
    id: string
    title: string
    content: string
    level: number
    subsections?: any[]
  }>
  options?: Array<{
    flag: string
    description: string
  }>
  examples?: string[]
  relatedCommands?: string[]
  seeAlso?: SeeAlsoItem[]
  keywords?: string[]
  author?: string
  bugs?: string
}

// Empty list - all data now comes from backend API
export const manPageList: ManPage[] = []

// Stub functions for backwards compatibility
// These should not be used - use backendClient.getManPage() instead
export function getManPage(name: string, section?: number): ManPage | undefined {
  console.warn('getManPage() is deprecated. Use backendClient.getManPage() from @/lib/api/backend-client instead')
  return undefined
}

// Stub function for backwards compatibility
// These should not be used - use backendClient.search() instead
export function searchManPages(query: string): ManPage[] {
  console.warn('searchManPages() is deprecated. Use backendClient.search() from @/lib/api/backend-client instead')
  return []
}