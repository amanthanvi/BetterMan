import { createClient } from '@supabase/supabase-js'

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Types
export interface ManPage {
  id: number
  name: string
  section: number
  title: string
  description: string
  synopsis: string
  content: string
  category: string
  is_common: boolean
  complexity: 'basic' | 'intermediate' | 'advanced'
  keywords: string[]
  see_also: any[]
  related_commands: string[]
  examples: any[]
  options: any[]
}

export interface SearchResult {
  query: string
  count: number
  results: ManPage[]
}

// API Functions
export async function searchManPages(
  query: string, 
  options?: {
    section?: number
    limit?: number
    offset?: number
  }
): Promise<SearchResult> {
  let dbQuery = supabase
    .from('documents')
    .select('*', { count: 'exact' })
    .limit(options?.limit || 20)

  if (options?.offset) {
    dbQuery = dbQuery.range(options.offset, options.offset + (options.limit || 20) - 1)
  }

  if (query) {
    // Use OR to search across multiple fields
    dbQuery = dbQuery.or(
      `name.ilike.%${query}%,title.ilike.%${query}%,description.ilike.%${query}%,search_content.ilike.%${query}%`
    )
  }

  if (options?.section) {
    dbQuery = dbQuery.eq('section', options.section)
  }

  // Order by relevance (common commands first, then by name)
  dbQuery = dbQuery.order('is_common', { ascending: false }).order('name')

  const { data, error, count } = await dbQuery

  if (error) {
    console.error('Search error:', error)
    throw error
  }

  return {
    query,
    count: count || 0,
    results: data || []
  }
}

export async function getManPage(name: string, section?: number): Promise<ManPage | null> {
  let query = supabase
    .from('documents')
    .select('*')
    .eq('name', name)

  if (section) {
    query = query.eq('section', section)
  }

  const { data, error } = await query.single()

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows returned
      return null
    }
    console.error('Get man page error:', error)
    throw error
  }

  return data
}

export async function getCommonCommands(limit = 20): Promise<ManPage[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('is_common', true)
    .order('name')
    .limit(limit)

  if (error) {
    console.error('Get common commands error:', error)
    throw error
  }

  return data || []
}

export async function getCategories(): Promise<{ category: string; count: number }[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('category')
    .order('category')

  if (error) {
    console.error('Get categories error:', error)
    throw error
  }

  // Count occurrences of each category
  const categoryCounts = data?.reduce((acc, doc) => {
    if (doc.category) {
      acc[doc.category] = (acc[doc.category] || 0) + 1
    }
    return acc
  }, {} as Record<string, number>)

  return Object.entries(categoryCounts || {})
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
}

export async function getCategoryPages(category: string, limit = 50): Promise<{
  category: string
  count: number
  pages: ManPage[]
}> {
  const { data, error, count } = await supabase
    .from('documents')
    .select('*', { count: 'exact' })
    .eq('category', category)
    .order('name')
    .limit(limit)

  if (error) {
    console.error('Get category pages error:', error)
    throw error
  }

  return {
    category,
    count: count || 0,
    pages: data || []
  }
}

// User-specific functions (require authentication)
export async function addToSearchHistory(query: string, resultsCount: number) {
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return

  await supabase.from('search_history').insert({
    query,
    results_count: resultsCount,
    user_id: user.id
  })
}

export async function addToViewHistory(documentId: number) {
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return

  await supabase.from('view_history').insert({
    document_id: documentId,
    user_id: user.id
  })
}

export async function toggleFavorite(documentId: number) {
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) throw new Error('Must be logged in to favorite')

  // Check if already favorited
  const { data: existing } = await supabase
    .from('favorites')
    .select('id')
    .eq('document_id', documentId)
    .eq('user_id', user.id)
    .single()

  if (existing) {
    // Remove favorite
    await supabase
      .from('favorites')
      .delete()
      .eq('id', existing.id)
    return false
  } else {
    // Add favorite
    await supabase
      .from('favorites')
      .insert({
        document_id: documentId,
        user_id: user.id
      })
    return true
  }
}

export async function getFavorites(): Promise<ManPage[]> {
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return []

  const { data, error } = await supabase
    .from('favorites')
    .select('documents(*)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Get favorites error:', error)
    return []
  }

  return data?.map(f => f.documents).filter(Boolean) || []
}