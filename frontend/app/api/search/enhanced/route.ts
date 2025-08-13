import { NextRequest, NextResponse } from 'next/server'
import { backendClient } from '@/lib/api/backend-client'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get('q') || ''
  const category = searchParams.get('category')
  const section = searchParams.get('section')
  const complexity = searchParams.get('complexity')
  const limit = parseInt(searchParams.get('limit') || '20')
  const fuzzy = searchParams.get('fuzzy') !== 'false'
  
  if (!query) {
    return NextResponse.json({ 
      results: [], 
      query: '', 
      total: 0,
      categories: [],
      suggestions: []
    })
  }

  try {
    // Use backend search with filters
    const searchData = await backendClient.search(query, { 
      limit,
      ...(section && { section })
    })

    // Transform results to enhanced format
    const results = searchData.results.map(result => ({
      id: `${result.name}.${result.section}`,
      name: result.name,
      section: result.section,
      title: result.title,
      description: result.description || result.title,
      category: result.category || 'User Commands',
      snippet: result.snippet || result.description?.substring(0, 150) || result.title,
      score: result.score || 0,
      relevance: result.score || 1,
      isCommon: false,
      isExactMatch: result.score === 0,
      complexity: complexity || 'basic',
    }))

    // Filter by category if specified
    const filteredResults = category 
      ? results.filter(r => r.category === category)
      : results

    // Get unique categories from results
    const categories = [...new Set(results.map(r => r.category))]

    return NextResponse.json({
      results: filteredResults,
      query,
      total: filteredResults.length,
      categories,
      suggestions: [], // Backend doesn't provide suggestions yet
      fuzzy,
    })
  } catch (error) {
    console.error('Enhanced search error:', error)
    return NextResponse.json({
      results: [],
      query,
      total: 0,
      categories: [],
      suggestions: [],
      error: 'Search failed',
    }, { status: 500 })
  }
}