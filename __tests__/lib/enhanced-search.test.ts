import { EnhancedSearch } from '@/lib/search/enhanced-search'
import type { SearchResult } from '@/lib/search/enhanced-search'

describe('EnhancedSearch', () => {
  let search: EnhancedSearch
  
  const mockData = {
    commands: {
      'ls.1': {
        name: 'ls',
        section: 1,
        title: 'list directory contents',
        description: 'List information about the FILEs',
        category: 'User Commands',
        complexity: 'basic',
        isCommon: true,
        keywords: ['list', 'directory', 'files'],
        searchContent: 'ls list directory contents files folders',
      },
      'grep.1': {
        name: 'grep',
        section: 1,
        title: 'search text patterns',
        description: 'Search for PATTERNS in each FILE',
        category: 'User Commands',
        complexity: 'intermediate',
        isCommon: true,
        keywords: ['search', 'pattern', 'text'],
        searchContent: 'grep search text patterns files regular expression',
      },
      'find.1': {
        name: 'find',
        section: 1,
        title: 'search for files',
        description: 'Search for files in a directory hierarchy',
        category: 'User Commands',
        complexity: 'intermediate',
        isCommon: true,
        keywords: ['find', 'search', 'files', 'directory'],
        searchContent: 'find search files directory hierarchy locate',
      },
    },
    invertedIndex: {
      'list': ['ls.1'],
      'directory': ['ls.1', 'find.1'],
      'search': ['grep.1', 'find.1'],
      'files': ['ls.1', 'grep.1', 'find.1'],
    },
    categoryIndex: {
      'User Commands': ['ls.1', 'grep.1', 'find.1'],
    },
    complexityIndex: {
      'basic': ['ls.1'],
      'intermediate': ['grep.1', 'find.1'],
    },
  }
  
  beforeEach(async () => {
    search = new EnhancedSearch()
    await search.initialize(mockData)
  })
  
  describe('search', () => {
    it('should find exact matches', async () => {
      const results = await search.search({ query: 'ls' })
      
      expect(results).toHaveLength(1)
      expect(results[0].name).toBe('ls')
      expect(results[0].isExactMatch).toBe(true)
      expect(results[0].searchStrategy).toBe('exact')
    })
    
    it('should find prefix matches', async () => {
      const results = await search.search({ query: 'gre' })
      
      expect(results).toHaveLength(1)
      expect(results[0].name).toBe('grep')
      expect(results[0].searchStrategy).toBe('exact')
    })
    
    it('should find fuzzy matches', async () => {
      const results = await search.search({ query: 'grp' })
      
      expect(results.length).toBeGreaterThan(0)
      expect(results.some(r => r.name === 'grep')).toBe(true)
    })
    
    it('should find full-text matches', async () => {
      const results = await search.search({ query: 'search files' })
      
      expect(results.length).toBeGreaterThan(0)
      expect(results.some(r => r.name === 'find')).toBe(true)
      expect(results.some(r => r.name === 'grep')).toBe(true)
    })
    
    it('should filter by section', async () => {
      const results = await search.search({ query: 'search', section: 1 })
      
      results.forEach(result => {
        expect(result.section).toBe(1)
      })
    })
    
    it('should filter by complexity', async () => {
      const results = await search.search({ query: 'files', complexity: 'basic' })
      
      expect(results).toHaveLength(1)
      expect(results[0].name).toBe('ls')
      expect(results[0].complexity).toBe('basic')
    })
    
    it('should respect limit parameter', async () => {
      const results = await search.search({ query: 'files', limit: 2 })
      
      expect(results.length).toBeLessThanOrEqual(2)
    })
    
    it('should return empty array for short queries', async () => {
      const results = await search.search({ query: 'a' })
      
      expect(results).toEqual([])
    })
    
    it('should include matches when requested', async () => {
      const results = await search.search({ query: 'list', includeMatches: true })
      
      expect(results[0].matches).toBeDefined()
      expect(results[0].matches!.length).toBeGreaterThan(0)
    })
  })
  
  describe('getSuggestions', () => {
    it('should return suggestions for prefix', async () => {
      const suggestions = await search.getSuggestions('gr')
      
      expect(suggestions).toContain('grep')
    })
    
    it('should return limited suggestions', async () => {
      const suggestions = await search.getSuggestions('f', 1)
      
      expect(suggestions).toHaveLength(1)
    })
    
    it('should return empty array for short prefix', async () => {
      const suggestions = await search.getSuggestions('a')
      
      expect(suggestions).toEqual([])
    })
    
    it('should prioritize popular commands', async () => {
      const suggestions = await search.getSuggestions('l')
      
      expect(suggestions[0]).toBe('ls')
    })
  })
  
  describe('getRelated', () => {
    it('should find related commands', async () => {
      const related = await search.getRelated('grep.1')
      
      expect(related.length).toBeGreaterThan(0)
      expect(related.some(r => r.name === 'find')).toBe(true)
    })
    
    it('should not include the original command', async () => {
      const related = await search.getRelated('ls.1')
      
      expect(related.every(r => r.id !== 'ls.1')).toBe(true)
    })
    
    it('should return empty array for unknown command', async () => {
      const related = await search.getRelated('unknown.1')
      
      expect(related).toEqual([])
    })
  })
})