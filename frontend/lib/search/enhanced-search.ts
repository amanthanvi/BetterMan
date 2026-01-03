import Fuse, { IFuseOptions, FuseResultMatch } from 'fuse.js'
import { EnhancedManPage } from '../parser/enhanced-man-parser'

export interface SearchResult {
  id: string
  name: string
  section: number
  title: string
  description: string
  category: string
  complexity: 'basic' | 'intermediate' | 'advanced'
  snippet: string
  score: number
  matches?: SearchMatch[]
  isExactMatch?: boolean
  searchStrategy?: 'exact' | 'fuzzy' | 'semantic' | 'fulltext'
}

export interface SearchMatch {
  key: string
  value: string
  indices: [number, number][]
}

export interface SearchOptions {
  query: string
  section?: number
  category?: string
  complexity?: 'basic' | 'intermediate' | 'advanced'
  limit?: number
  threshold?: number
  includeMatches?: boolean
}

export interface SearchIndex {
  commands: Map<string, any>
  fuzzyIndex: Fuse<any>
  invertedIndex: Map<string, Set<string>>
  categoryIndex: Map<string, string[]>
  complexityIndex: Map<string, string[]>
  popularityScores: Map<string, number>
}

export interface ManPageIndex {
  commands: Record<string, any>
  invertedIndex?: Record<string, string[]>
  categoryIndex?: Record<string, string[]>
  complexityIndex?: Record<string, string[]>
}

export class EnhancedSearch {
  private index: SearchIndex | null = null
  private commandData: Map<string, any> = new Map()
  
  // Fuse.js configuration for fuzzy search
  private fuseOptions: IFuseOptions<any> = {
    keys: [
      { name: 'name', weight: 3 },
      { name: 'title', weight: 2 },
      { name: 'description', weight: 1.5 },
      { name: 'keywords', weight: 1 },
      { name: 'searchContent', weight: 0.5 },
    ],
    threshold: 0.3,
    includeScore: true,
    includeMatches: true,
    minMatchCharLength: 2,
    shouldSort: true,
    findAllMatches: true,
    ignoreLocation: true,
  }
  
  // Popular commands get a boost in search results
  private popularCommands = new Map([
    ['ls', 100], ['cd', 95], ['grep', 90], ['find', 85], ['ssh', 80],
    ['git', 80], ['docker', 75], ['curl', 70], ['vim', 70], ['cat', 65],
    ['echo', 60], ['mkdir', 60], ['rm', 60], ['cp', 55], ['mv', 55],
    ['chmod', 50], ['ps', 50], ['kill', 45], ['tar', 45], ['sed', 40],
  ])

  /**
   * Initialize search index from data
   */
  async initialize(data: {
    commands: Record<string, any>
    invertedIndex?: Record<string, string[]>
    categoryIndex?: Record<string, string[]>
    complexityIndex?: Record<string, string[]>
  }) {
    // Build command data map
    this.commandData = new Map(Object.entries(data.commands))
    
    // Build Fuse index for fuzzy search
    const fuseData = Array.from(this.commandData.entries()).map(([id, cmd]) => ({
      id,
      ...cmd,
    }))
    const fuzzyIndex = new Fuse(fuseData, this.fuseOptions)
    
    // Build inverted index
    const invertedIndex = new Map<string, Set<string>>()
    if (data.invertedIndex) {
      Object.entries(data.invertedIndex).forEach(([word, pages]) => {
        invertedIndex.set(word, new Set(pages))
      })
    }
    
    // Build category index
    const categoryIndex = new Map(Object.entries(data.categoryIndex || {}))
    
    // Build complexity index
    const complexityIndex = new Map(Object.entries(data.complexityIndex || {}))
    
    // Calculate popularity scores
    const popularityScores = new Map<string, number>()
    this.commandData.forEach((cmd, id) => {
      const name = cmd.name
      const baseScore = this.popularCommands.get(name) || 0
      const isCommon = cmd.isCommon ? 20 : 0
      popularityScores.set(id, baseScore + isCommon)
    })
    
    this.index = {
      commands: this.commandData,
      fuzzyIndex,
      invertedIndex,
      categoryIndex,
      complexityIndex,
      popularityScores,
    }
  }

  /**
   * Perform multi-strategy search
   */
  async search(options: SearchOptions): Promise<SearchResult[]> {
    if (!this.index) {
      throw new Error('Search index not initialized')
    }
    
    const { query, section, category, complexity, limit = 50, threshold = 0.3, includeMatches = true } = options
    
    if (!query || query.length < 2) {
      return []
    }
    
    // Normalize query
    const normalizedQuery = query.toLowerCase().trim()
    const queryWords = normalizedQuery.split(/\s+/).filter(w => w.length > 1)
    
    // Collect results from different strategies
    const resultMap = new Map<string, SearchResult>()
    
    // Strategy 1: Exact name match (highest priority)
    this.exactNameSearch(normalizedQuery, resultMap)
    
    // Strategy 2: Prefix match
    this.prefixSearch(normalizedQuery, resultMap)
    
    // Strategy 3: Fuzzy search
    this.fuzzySearch(normalizedQuery, resultMap, threshold, includeMatches)
    
    // Strategy 4: Full-text search
    this.fullTextSearch(queryWords, resultMap)
    
    // Convert to array and apply filters
    let results = Array.from(resultMap.values())
    
    // Apply filters
    if (section) {
      results = results.filter(r => r.section === section)
    }
    if (category) {
      results = results.filter(r => r.category === category)
    }
    if (complexity) {
      results = results.filter(r => r.complexity === complexity)
    }
    
    // Sort by score and popularity
    results.sort((a, b) => {
      // Exact matches first
      if (a.isExactMatch && !b.isExactMatch) return -1
      if (!a.isExactMatch && b.isExactMatch) return 1
      
      // Then by score
      const scoreDiff = b.score - a.score
      if (Math.abs(scoreDiff) > 0.1) return scoreDiff
      
      // Then by popularity
      const popA = this.index!.popularityScores.get(a.id) || 0
      const popB = this.index!.popularityScores.get(b.id) || 0
      return popB - popA
    })
    
    // Apply limit
    return results.slice(0, limit)
  }

  /**
   * Exact name match search
   */
  private exactNameSearch(query: string, resultMap: Map<string, SearchResult>) {
    this.index!.commands.forEach((cmd, id) => {
      if (cmd.name.toLowerCase() === query) {
        resultMap.set(id, {
          id,
          name: cmd.name,
          section: cmd.section,
          title: cmd.title,
          description: cmd.description,
          category: cmd.category,
          complexity: cmd.complexity || 'intermediate',
          snippet: this.generateSnippet(cmd.description, query),
          score: 1.0,
          isExactMatch: true,
          searchStrategy: 'exact',
        })
      }
    })
  }

  /**
   * Prefix match search
   */
  private prefixSearch(query: string, resultMap: Map<string, SearchResult>) {
    this.index!.commands.forEach((cmd, id) => {
      if (cmd.name.toLowerCase().startsWith(query) && !resultMap.has(id)) {
        const score = 0.9 - (cmd.name.length - query.length) * 0.05
        resultMap.set(id, {
          id,
          name: cmd.name,
          section: cmd.section,
          title: cmd.title,
          description: cmd.description,
          category: cmd.category,
          complexity: cmd.complexity || 'intermediate',
          snippet: this.generateSnippet(cmd.description, query),
          score: Math.max(score, 0.5),
          searchStrategy: 'exact',
        })
      }
    })
  }

  /**
   * Fuzzy search using Fuse.js
   */
  private fuzzySearch(
    query: string,
    resultMap: Map<string, SearchResult>,
    threshold: number,
    includeMatches: boolean
  ) {
    const fuseResults = this.index!.fuzzyIndex.search(query, {
      limit: 100,
    })
    
    fuseResults.forEach(result => {
      if (!resultMap.has(result.item.id)) {
        const cmd = result.item
        const score = 1 - (result.score || 0)
        
        resultMap.set(cmd.id, {
          id: cmd.id,
          name: cmd.name,
          section: cmd.section,
          title: cmd.title,
          description: cmd.description,
          category: cmd.category,
          complexity: cmd.complexity || 'intermediate',
          snippet: this.generateSnippet(cmd.description, query),
          score: score * 0.8, // Fuzzy matches get lower scores
          matches: includeMatches ? this.formatMatches(result.matches) : undefined,
          searchStrategy: 'fuzzy',
        })
      }
    })
  }

  /**
   * Full-text search using inverted index
   */
  private fullTextSearch(queryWords: string[], resultMap: Map<string, SearchResult>) {
    const matchingDocs = new Map<string, number>()
    
    // Find documents containing query words
    queryWords.forEach(word => {
      const docs = this.index!.invertedIndex.get(word)
      if (docs) {
        docs.forEach(doc => {
          matchingDocs.set(doc, (matchingDocs.get(doc) || 0) + 1)
        })
      }
    })
    
    // Score based on how many query words matched
    matchingDocs.forEach((matchCount, docId) => {
      if (!resultMap.has(docId)) {
        const cmd = this.index!.commands.get(docId)
        if (cmd) {
          const score = (matchCount / queryWords.length) * 0.6
          
          resultMap.set(docId, {
            id: docId,
            name: cmd.name,
            section: cmd.section,
            title: cmd.title,
            description: cmd.description,
            category: cmd.category,
            complexity: cmd.complexity || 'intermediate',
            snippet: this.generateSnippet(cmd.description || cmd.title, queryWords.join(' ')),
            score,
            searchStrategy: 'fulltext',
          })
        }
      }
    })
  }

  /**
   * Get search suggestions for autocomplete
   */
  async getSuggestions(prefix: string, limit: number = 10): Promise<string[]> {
    if (!this.index || prefix.length < 2) {
      return []
    }
    
    const suggestions = new Set<string>()
    const normalizedPrefix = prefix.toLowerCase()
    
    // Add exact prefix matches first
    this.index.commands.forEach(cmd => {
      if (cmd.name.toLowerCase().startsWith(normalizedPrefix)) {
        suggestions.add(cmd.name)
      }
    })
    
    // Add fuzzy matches if needed
    if (suggestions.size < limit) {
      const fuzzyResults = this.index.fuzzyIndex.search(prefix, {
        limit: limit * 2,
      })
      
      fuzzyResults.forEach(result => {
        suggestions.add(result.item.name)
      })
    }
    
    // Sort by popularity and limit
    return Array.from(suggestions)
      .sort((a, b) => {
        const popA = this.popularCommands.get(a) || 0
        const popB = this.popularCommands.get(b) || 0
        return popB - popA
      })
      .slice(0, limit)
  }

  /**
   * Get related commands
   */
  async getRelated(commandId: string, limit: number = 5): Promise<SearchResult[]> {
    if (!this.index) {
      return []
    }
    
    const command = this.index.commands.get(commandId)
    if (!command) {
      return []
    }
    
    // Search for related commands using keywords
    const keywords = [
      command.category.toLowerCase(),
      ...command.keywords.slice(0, 5),
    ].join(' ')
    
    const results = await this.search({
      query: keywords,
      limit: limit + 1, // Get one extra to exclude self
    })
    
    // Filter out the original command
    return results.filter(r => r.id !== commandId).slice(0, limit)
  }

  /**
   * Generate snippet with highlighted matches
   */
  private generateSnippet(text: string, query: string): string {
    if (!text) return ''
    
    const maxLength = 150
    const queryLower = query.toLowerCase()
    const textLower = text.toLowerCase()
    const index = textLower.indexOf(queryLower)
    
    if (index === -1) {
      // No direct match, return beginning of text
      return text.length > maxLength
        ? text.substring(0, maxLength) + '...'
        : text
    }
    
    // Extract snippet around match
    const start = Math.max(0, index - 50)
    const end = Math.min(text.length, index + queryLower.length + 100)
    let snippet = text.substring(start, end)
    
    // Add ellipsis if needed
    if (start > 0) snippet = '...' + snippet
    if (end < text.length) snippet = snippet + '...'
    
    return snippet
  }

  /**
   * Format Fuse.js matches for display
   */
  private formatMatches(matches?: readonly FuseResultMatch[]): SearchMatch[] {
    if (!matches) return []
    
    return matches.map(match => ({
      key: match.key || '',
      value: match.value || '',
      indices: match.indices as [number, number][],
    }))
  }
}