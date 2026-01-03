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
   * Perform search via backend API
   */
  async search(options: SearchOptions): Promise<SearchResult[]> {
    const { query, section, limit = 50, fuzzy = true } = options
    const cacheKey = `${query}-${section}-${limit}-${fuzzy}`
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!
    }
    
    try {
      const results = await this.apiSearch(options)
      this.cache.set(cacheKey, results)
      return results
    } catch (error) {
      console.error('Search error:', error)
      return []
    }
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
    if (prefix.length < 2) {
      return []
    }
    
    try {
      // Try API for suggestions
      const response = await fetch(
        `/api/search/suggestions?prefix=${encodeURIComponent(prefix)}&limit=${limit}`
      )
      
      if (response.ok) {
        const suggestions = await response.json()
        return Array.isArray(suggestions) ? suggestions : []
      }
    } catch (error) {
      console.error('Suggestions API error:', error)
    }
    
    // Fallback to basic search
    const results = await this.search({ query: prefix, limit, fuzzy: false })
    return results.map(r => r.name)
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