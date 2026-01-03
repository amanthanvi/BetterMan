import Fuse from 'fuse.js'

export interface SearchResult {
  id: string
  name: string
  section: number
  title: string
  description: string
  category: string
  score?: number
  snippet?: string
  isCommon?: boolean
  isExactMatch?: boolean
  matches?: any[]
}

export interface SearchOptions {
  query: string
  section?: number
  limit?: number
  fuzzy?: boolean
}

class InstantSearchClient {
  private cache = new Map<string, SearchResult[]>()
  private searchDebounceTimer: NodeJS.Timeout | null = null
  private pendingSearch: AbortController | null = null
  
  /**
   * Perform instant search with caching and debouncing
   */
  async search(options: SearchOptions): Promise<SearchResult[]> {
    const { query, section, limit = 20, fuzzy = true } = options
    
    if (!query || query.length === 0) {
      return []
    }
    
    // Generate cache key
    const cacheKey = `${query}-${section}-${limit}-${fuzzy}`
    
    // Check cache first for instant results
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!
    }
    
    // Cancel any pending search
    if (this.pendingSearch) {
      this.pendingSearch.abort()
    }
    
    // Create new abort controller for this search
    this.pendingSearch = new AbortController()
    
    try {
      const params = new URLSearchParams({
        q: query,
        limit: limit.toString(),
        fuzzy: fuzzy.toString()
      })
      
      if (section) {
        params.append('section', section.toString())
      }
      
      const response = await fetch(`/api/search?${params}`, {
        signal: this.pendingSearch.signal
      })
      
      if (!response.ok) {
        throw new Error('Search API error')
      }
      
      const data = await response.json()
      const results = data.results || []
      
      // Cache the results
      this.cache.set(cacheKey, results)
      
      // Clear old cache entries if cache gets too large
      if (this.cache.size > 50) {
        const firstKey = this.cache.keys().next().value
        if (firstKey) this.cache.delete(firstKey)
      }
      
      return results
    } catch (error: any) {
      // Ignore abort errors
      if (error.name === 'AbortError') {
        return []
      }
      console.error('Search error:', error)
      return []
    } finally {
      this.pendingSearch = null
    }
  }
  
  /**
   * Perform instant search with debouncing
   */
  async searchDebounced(
    options: SearchOptions,
    delay: number = 150
  ): Promise<SearchResult[]> {
    return new Promise((resolve) => {
      // Clear existing timer
      if (this.searchDebounceTimer) {
        clearTimeout(this.searchDebounceTimer)
      }
      
      // Set new timer
      this.searchDebounceTimer = setTimeout(async () => {
        const results = await this.search(options)
        resolve(results)
      }, delay)
    })
  }
  
  /**
   * Get search suggestions for autocomplete with instant response
   */
  async getSuggestions(prefix: string, limit = 8): Promise<string[]> {
    if (!prefix || prefix.length < 1) {
      return []
    }
    
    // Check cache for suggestions
    const cacheKey = `suggestions-${prefix}-${limit}`
    const cached = this.cache.get(cacheKey) as any
    if (cached && Array.isArray(cached)) {
      return cached
    }
    
    try {
      const response = await fetch(
        `/api/search/suggestions?prefix=${encodeURIComponent(prefix)}&limit=${limit}`
      )
      
      if (response.ok) {
        const suggestions = await response.json()
        // Cache suggestions
        this.cache.set(cacheKey, suggestions)
        return Array.isArray(suggestions) ? suggestions : []
      }
    } catch (error) {
      console.error('Suggestions API error:', error)
    }
    
    return []
  }
  
  /**
   * Clear search cache
   */
  clearCache() {
    this.cache.clear()
  }
  
  /**
   * Cancel any pending searches
   */
  cancelPendingSearches() {
    if (this.pendingSearch) {
      this.pendingSearch.abort()
      this.pendingSearch = null
    }
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer)
      this.searchDebounceTimer = null
    }
  }
}

// Export singleton instance
export const instantSearchClient = new InstantSearchClient()