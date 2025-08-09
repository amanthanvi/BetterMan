import { NextRequest, NextResponse } from 'next/server'
import { EnhancedSearch } from '@/lib/search/enhanced-search'
import { kv } from '@vercel/kv'

// Initialize search engine
let searchEngine: EnhancedSearch | null = null

async function getSearchEngine(): Promise<EnhancedSearch> {
  if (searchEngine) return searchEngine
  
  try {
    // Try to load indexes from KV cache first
    const cacheKey = 'search-index-v2'
    const cachedData = await kv.get(cacheKey).catch(() => null)
    
    if (cachedData) {
      searchEngine = new EnhancedSearch()
      await searchEngine.initialize(cachedData as any)
      return searchEngine
    }
  } catch (error) {
    console.error('Failed to load cached search index:', error)
  }
  
  // Load from static files
  const [commands, invertedIndex, categoryIndex, complexityIndex] = await Promise.all([
    import('@/data/indexes/command-index.json'),
    import('@/data/indexes/inverted-index.json'),
    import('@/data/indexes/category-index.json'),
    import('@/data/indexes/complexity-index.json'),
  ])
  
  searchEngine = new EnhancedSearch()
  await searchEngine.initialize({
    commands: commands.default,
    invertedIndex: invertedIndex.default,
    categoryIndex: categoryIndex.default,
    complexityIndex: complexityIndex.default,
  })
  
  // Cache the index data for future requests
  try {
    await kv.set('search-index-v2', {
      commands: commands.default,
      invertedIndex: invertedIndex.default,
      categoryIndex: categoryIndex.default,
      complexityIndex: complexityIndex.default,
    }, { ex: 3600 }) // Cache for 1 hour
  } catch (error) {
    console.error('Failed to cache search index:', error)
  }
  
  return searchEngine
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('q') || ''
    const section = searchParams.get('section')
    const category = searchParams.get('category')
    const complexity = searchParams.get('complexity') as any
    const limit = parseInt(searchParams.get('limit') || '20')
    const includeMatches = searchParams.get('matches') === 'true'
    
    if (!query || query.length < 2) {
      return NextResponse.json({
        results: [],
        query: '',
        total: 0,
        searchTime: 0,
      })
    }
    
    const startTime = performance.now()
    
    // Get search engine
    const engine = await getSearchEngine()
    
    // Perform search
    const results = await engine.search({
      query,
      section: section ? parseInt(section) : undefined,
      category: category || undefined,
      complexity: complexity || undefined,
      limit,
      includeMatches,
    })
    
    const searchTime = performance.now() - startTime
    
    // Log search analytics
    if (process.env.NODE_ENV === 'production') {
      try {
        await kv.hincrby('search-analytics', query.toLowerCase(), 1)
        await kv.zadd('popular-searches', {
          score: Date.now(),
          member: query.toLowerCase(),
        })
      } catch (error) {
        console.error('Failed to log search analytics:', error)
      }
    }
    
    return NextResponse.json({
      results,
      query,
      total: results.length,
      searchTime: Math.round(searchTime * 100) / 100,
      strategies: [...new Set(results.map(r => r.searchStrategy))],
    })
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json(
      { error: 'Search failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// Suggestions endpoint
export async function POST(request: NextRequest) {
  try {
    const { prefix } = await request.json()
    
    if (!prefix || prefix.length < 2) {
      return NextResponse.json({ suggestions: [] })
    }
    
    const engine = await getSearchEngine()
    const suggestions = await engine.getSuggestions(prefix, 10)
    
    return NextResponse.json({ suggestions })
  } catch (error) {
    console.error('Suggestions error:', error)
    return NextResponse.json({ suggestions: [] })
  }
}