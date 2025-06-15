import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cache, cacheKeys } from '@/lib/cache/kv'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get('q')
  const section = searchParams.get('section')
  const limit = parseInt(searchParams.get('limit') || '50')
  const offset = parseInt(searchParams.get('offset') || '0')

  if (!query) {
    return NextResponse.json({ error: 'Query parameter is required' }, { status: 400 })
  }

  try {
    // Try cache first
    const cacheKey = cacheKeys.search(query, { section, limit, offset })
    
    const results = await cache.getOrSet(
      cacheKey,
      async () => {
        const supabase = await createClient()
        
        // Use PostgreSQL full-text search
        const { data, error } = await supabase.rpc('search_documents', {
          search_query: query,
          section_filter: section ? parseInt(section) : null,
          limit_count: limit
        })

        if (error) {
          throw error
        }

        return data || []
      },
      { ttl: 300, tags: ['search'] } // Cache for 5 minutes
    )

    // Track search analytics (non-blocking)
    const supabase = await createClient()
    void supabase.from('analytics').insert({
      event_type: 'search',
      search_query: query,
      metadata: { section, results_count: results.length }
    })

    return NextResponse.json({
      results,
      query,
      total: results.length
    })
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Edge runtime for better performance
export const runtime = 'edge'