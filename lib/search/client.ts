import Fuse from 'fuse.js'

// Dynamic import to avoid build issues
let staticSearch: any = null
if (typeof window !== 'undefined') {
  import('@/data/search-index').then(module => {
    staticSearch = module.search
  })
}

export interface SearchResult {
  id: string
  name: string
  section: number
  title: string
  description: string
  category: string
  score?: number
  highlights?: {
    name?: string[]
    title?: string[]
    description?: string[]
  }
}

export interface SearchOptions {
  query: string
  section?: number
  limit?: number
  fuzzy?: boolean
}

class SearchClient {
  private cache = new Map<string, SearchResult[]>()
  
  /**
   * Perform hybrid search - tries client-side first, falls back to API
   */
  async search(options: SearchOptions): Promise<SearchResult[]> {
    const { query, section, limit = 50, fuzzy = true } = options
    const cacheKey = `${query}-${section}-${limit}-${fuzzy}`
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!
    }
    
    try {
      // Try client-side search first (fastest)
      const results = this.clientSearch(query, { section, limit, fuzzy })
      
      if (results.length > 0) {
        this.cache.set(cacheKey, results)
        return results
      }
      
      // If no results or need more advanced search, use API
      return await this.apiSearch(options)
    } catch (error) {
      console.error('Search error:', error)
      // Fallback to basic search
      return this.clientSearch(query, { section, limit: 10, fuzzy: false })
    }
  }
  
  /**
   * Client-side search using pre-built index
   */
  private clientSearch(
    query: string,
    options: { section?: number; limit?: number; fuzzy?: boolean }
  ): SearchResult[] {
    const { section, limit = 50, fuzzy = true } = options
    
    // Use static search from pre-built index if available
    if (!staticSearch) {
      return [] // Return empty during build or before loaded
    }
    let results = staticSearch(query, { limit: limit * 2, section })
    
    // Post-process results
    results = results.map((r: any) => ({
      ...r,
      highlights: this.generateHighlights(r, query)
    }))
    
    // Sort by relevance
    results.sort((a: any, b: any) => {
      // Exact name match gets highest priority
      if (a.name === query && b.name !== query) {
        return -1
      }
      if (b.name === query && a.name !== query) {
        return 1
      }
      
      // Then by score
      const scoreA = a.score || 1
      const scoreB = b.score || 1
      return scoreA - scoreB
    })
    
    return results.slice(0, limit)
  }
  
  /**
   * Server-side search via API
   */
  private async apiSearch(options: SearchOptions): Promise<SearchResult[]> {
    const params = new URLSearchParams({
      q: options.query,
      limit: options.limit?.toString() || '50'
    })
    
    if (options.section) {
      params.append('section', options.section.toString())
    }
    
    if (options.fuzzy !== undefined) {
      params.append('fuzzy', options.fuzzy.toString())
    }
    
    const response = await fetch(`/api/search?${params}`)
    
    if (!response.ok) {
      throw new Error('Search API error')
    }
    
    const data = await response.json()
    return data.results
  }
  
  /**
   * Get search suggestions for autocomplete
   */
  async getSuggestions(prefix: string, limit = 10): Promise<string[]> {
    if (prefix.length < 2) return []
    
    try {
      // Try API first for most up-to-date suggestions
      const response = await fetch(
        `/api/search/suggestions?prefix=${encodeURIComponent(prefix)}&limit=${limit}`
      )
      
      if (response.ok) {
        const data = await response.json()
        return data.suggestions
      }
    } catch (error) {
      console.error('Suggestions API error:', error)
    }
    
    // Fallback to client-side suggestions
    const results = this.clientSearch(prefix, { limit, fuzzy: false })
    return results.map(r => r.name)
  }
  
  /**
   * Generate text highlights for search results
   */
  private generateHighlights(
    result: SearchResult,
    query: string
  ): SearchResult['highlights'] {
    const highlights: SearchResult['highlights'] = {}
    const terms = query.toLowerCase().split(/\s+/)
    
    // Helper to highlight terms in text
    const highlightText = (text: string): string[] => {
      const matches: string[] = []
      const lowerText = text.toLowerCase()
      
      for (const term of terms) {
        let index = lowerText.indexOf(term)
        while (index !== -1) {
          const start = Math.max(0, index - 20)
          const end = Math.min(text.length, index + term.length + 20)
          const snippet = text.slice(start, end)
          matches.push(snippet)
          index = lowerText.indexOf(term, index + 1)
        }
      }
      
      return matches.slice(0, 3) // Max 3 highlights per field
    }
    
    if (result.name) {
      highlights.name = highlightText(result.name)
    }
    
    if (result.title) {
      highlights.title = highlightText(result.title)
    }
    
    if (result.description) {
      highlights.description = highlightText(result.description)
    }
    
    return highlights
  }
  
  /**
   * Clear search cache
   */
  clearCache() {
    this.cache.clear()
  }
}

// Export singleton instance
export const searchClient = new SearchClient()