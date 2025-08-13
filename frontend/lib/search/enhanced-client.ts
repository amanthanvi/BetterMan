import Fuse, { IFuseOptions } from 'fuse.js'

export interface SearchResult {
  id: string
  name: string
  section: number | string
  title: string
  description: string
  category: string
  score?: number
  snippet?: string
  highlights?: {
    name?: string[]
    title?: string[]
    description?: string[]
  }
}

export interface SearchOptions {
  query: string
  section?: number | string
  limit?: number
  fuzzy?: boolean
  threshold?: number
}

class EnhancedSearchClient {
  private cache = new Map<string, SearchResult[]>()
  private fuseIndex: Fuse<SearchResult> | null = null
  private allCommands: SearchResult[] = []
  
  /**
   * Initialize Fuse.js index with commands for client-side fuzzy search
   */
  async initializeFuseIndex() {
    try {
      // Fetch all commands for indexing
      const response = await fetch('/api/man/commands?limit=1000')
      if (!response.ok) return
      
      const data = await response.json()
      this.allCommands = data.commands.map((cmd: any) => ({
        id: `${cmd.name}.${cmd.section}`,
        name: cmd.name,
        section: cmd.section,
        title: cmd.title,
        description: cmd.description,
        category: cmd.category,
        score: 1.0
      }))
      
      // Configure Fuse.js with optimal settings for man pages
      const fuseOptions: IFuseOptions<SearchResult> = {
        keys: [
          { name: 'name', weight: 0.4 },
          { name: 'title', weight: 0.3 },
          { name: 'description', weight: 0.2 },
          { name: 'category', weight: 0.1 }
        ],
        threshold: 0.4, // Lower = more strict matching
        includeScore: true,
        includeMatches: true,
        minMatchCharLength: 2,
        shouldSort: true,
        findAllMatches: false,
        location: 0,
        distance: 100,
        useExtendedSearch: false,
        ignoreLocation: false,
        ignoreFieldNorm: false
      }
      
      this.fuseIndex = new Fuse(this.allCommands, fuseOptions)
      console.log('Fuse.js index initialized with', this.allCommands.length, 'commands')
    } catch (error) {
      console.error('Failed to initialize Fuse.js index:', error)
    }
  }
  
  /**
   * Perform enhanced search with backend fuzzy search and Fuse.js fallback
   */
  async search(options: SearchOptions): Promise<SearchResult[]> {
    const { query, section, limit = 50, fuzzy = true, threshold = 0.3 } = options
    const cacheKey = `${query}-${section}-${limit}-${fuzzy}-${threshold}`
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!
    }
    
    try {
      // Try backend search first (with PostgreSQL fuzzy matching)
      const results = await this.backendSearch(options)
      
      // If backend returns good results, use them
      if (results.length > 0) {
        this.cache.set(cacheKey, results)
        return results
      }
      
      // Fallback to client-side Fuse.js search
      if (this.fuseIndex && fuzzy) {
        const fuseResults = await this.clientFuzzySearch(query, limit, section)
        this.cache.set(cacheKey, fuseResults)
        return fuseResults
      }
      
      return []
    } catch (error) {
      console.error('Search error:', error)
      
      // Last resort: client-side search if available
      if (this.fuseIndex) {
        return this.clientFuzzySearch(query, limit, section)
      }
      
      return []
    }
  }
  
  /**
   * Backend search with fuzzy matching
   */
  private async backendSearch(options: SearchOptions): Promise<SearchResult[]> {
    const params = new URLSearchParams({
      q: options.query,
      limit: options.limit?.toString() || '50',
      fuzzy: options.fuzzy?.toString() || 'true',
      threshold: options.threshold?.toString() || '0.3'
    })
    
    if (options.section) {
      params.append('section', options.section.toString())
    }
    
    const response = await fetch(`/api/search?${params}`)
    
    if (!response.ok) {
      throw new Error('Search API error')
    }
    
    const data = await response.json()
    return data.results || []
  }
  
  /**
   * Client-side fuzzy search using Fuse.js
   */
  private clientFuzzySearch(
    query: string, 
    limit: number = 50, 
    section?: number | string
  ): SearchResult[] {
    if (!this.fuseIndex) {
      return []
    }
    
    // Perform Fuse.js search
    const fuseResults = this.fuseIndex.search(query, { limit: limit * 2 })
    
    // Transform and filter results
    let results = fuseResults.map(result => ({
      ...result.item,
      score: 1 - (result.score || 0), // Convert Fuse score (0 = perfect) to our score (1 = perfect)
      highlights: this.extractHighlights(result.matches)
    }))
    
    // Filter by section if specified
    if (section) {
      results = results.filter(r => r.section.toString() === section.toString())
    }
    
    // Sort by score and limit
    results.sort((a, b) => (b.score || 0) - (a.score || 0))
    
    return results.slice(0, limit)
  }
  
  /**
   * Extract highlights from Fuse.js matches
   */
  private extractHighlights(matches: any): SearchResult['highlights'] {
    if (!matches) return {}
    
    const highlights: SearchResult['highlights'] = {}
    
    for (const match of matches) {
      const field = match.key as string
      
      // Extract matched text snippets
      if (match.indices && match.value) {
        const snippets: string[] = []
        for (const [start, end] of match.indices) {
          const snippet = match.value.substring(
            Math.max(0, start - 20),
            Math.min(match.value.length, end + 20)
          )
          snippets.push(snippet)
        }
        
        // Assign to appropriate field
        if (field === 'name') {
          highlights.name = snippets
        } else if (field === 'title') {
          highlights.title = snippets
        } else if (field === 'description') {
          highlights.description = snippets
        }
      }
    }
    
    return highlights
  }
  
  /**
   * Get search suggestions for autocomplete
   */
  async getSuggestions(prefix: string, limit = 10): Promise<string[]> {
    if (prefix.length < 2) {
      return []
    }
    
    // Try backend suggestions first
    try {
      const response = await fetch(
        `/api/search/suggestions?prefix=${encodeURIComponent(prefix)}&limit=${limit}`
      )
      
      if (response.ok) {
        const suggestions = await response.json()
        if (Array.isArray(suggestions) && suggestions.length > 0) {
          return suggestions
        }
      }
    } catch (error) {
      console.error('Suggestions API error:', error)
    }
    
    // Fallback to client-side suggestions using Fuse.js
    if (this.fuseIndex) {
      const results = this.fuseIndex.search(prefix, { limit })
      return results.map(r => r.item.name)
    }
    
    // Final fallback: simple prefix matching
    return this.allCommands
      .filter(cmd => cmd.name.toLowerCase().startsWith(prefix.toLowerCase()))
      .slice(0, limit)
      .map(cmd => cmd.name)
  }
  
  /**
   * Clear search cache
   */
  clearCache() {
    this.cache.clear()
  }
}

// Export singleton instance
export const enhancedSearchClient = new EnhancedSearchClient()

// Initialize Fuse.js index on client-side
if (typeof window !== 'undefined') {
  enhancedSearchClient.initializeFuseIndex()
}