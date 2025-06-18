/**
 * API client for backend communication
 * Now uses Supabase as the primary data source with optional fallback to FastAPI
 */

import * as supabaseApi from '@/lib/supabase/api'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const API_ENABLED = process.env.NEXT_PUBLIC_API_ENABLED === 'true'
const USE_SUPABASE = process.env.NEXT_PUBLIC_USE_SUPABASE !== 'false' // Default to true

export interface SearchResult {
  id: number
  name: string
  section: number
  title: string
  description: string
  category: string
  snippet: string
  score: number
}

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
  see_also: Array<{ name: string; section: number }>
  related_commands: string[]
  examples: any[]
  options: any[]
}

class APIClient {
  private baseURL: string

  constructor() {
    this.baseURL = API_URL
  }

  private async fetch(path: string, options?: RequestInit) {
    if (!API_ENABLED) {
      throw new Error('API is not enabled')
    }

    const response = await fetch(`${this.baseURL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`)
    }

    return response.json()
  }

  async search(query: string, limit = 20): Promise<{
    query: string
    count: number
    results: SearchResult[]
  }> {
    // Try Supabase first
    if (USE_SUPABASE) {
      try {
        const result = await supabaseApi.searchManPages(query, { limit })
        return {
          query: result.query,
          count: result.count,
          results: result.results.map(r => ({
            id: r.id,
            name: r.name,
            section: r.section,
            title: r.title,
            description: r.description,
            category: r.category,
            snippet: r.description,
            score: r.is_common ? 1.0 : 0.5
          }))
        }
      } catch (error) {
        console.warn('Supabase search failed, falling back to API:', error)
      }
    }

    // Fallback to FastAPI
    const params = new URLSearchParams({
      q: query,
      limit: limit.toString(),
    })
    
    return this.fetch(`/api/search?${params}`)
  }

  async getManPage(name: string, section?: number): Promise<ManPage> {
    // Try Supabase first
    if (USE_SUPABASE) {
      try {
        const page = await supabaseApi.getManPage(name, section)
        if (page) {
          return {
            id: page.id,
            name: page.name,
            section: page.section,
            title: page.title,
            description: page.description,
            synopsis: page.synopsis,
            content: page.content,
            category: page.category,
            is_common: page.is_common,
            complexity: page.complexity,
            keywords: page.keywords,
            see_also: page.see_also,
            related_commands: page.related_commands,
            examples: page.examples,
            options: page.options
          }
        }
      } catch (error) {
        console.warn('Supabase getManPage failed, falling back to API:', error)
      }
    }

    // Fallback to FastAPI
    const path = section 
      ? `/api/man/${name}/${section}`
      : `/api/man/${name}`
    
    return this.fetch(path)
  }

  async getCommonCommands(): Promise<{ commands: any[] }> {
    // Try Supabase first
    if (USE_SUPABASE) {
      try {
        const commands = await supabaseApi.getCommonCommands()
        return { commands }
      } catch (error) {
        console.warn('Supabase getCommonCommands failed, falling back to API:', error)
      }
    }

    // Fallback to FastAPI
    return this.fetch('/api/common')
  }

  async getCategories(): Promise<{ categories: Array<{ category: string; count: number }> }> {
    // Try Supabase first
    if (USE_SUPABASE) {
      try {
        const categories = await supabaseApi.getCategories()
        return { categories }
      } catch (error) {
        console.warn('Supabase getCategories failed, falling back to API:', error)
      }
    }

    // Fallback to FastAPI
    return this.fetch('/api/categories')
  }

  async getCategoryPages(category: string, limit = 50): Promise<{
    category: string
    count: number
    pages: any[]
  }> {
    const params = new URLSearchParams({ limit: limit.toString() })
    return this.fetch(`/api/category/${encodeURIComponent(category)}?${params}`)
  }

  async getStats(): Promise<any> {
    return this.fetch('/api/stats')
  }

  async trackClick(query: string, result: string): Promise<void> {
    await this.fetch('/api/track/click', {
      method: 'POST',
      body: JSON.stringify({ query, result }),
    })
  }
}

// Export singleton instance
export const apiClient = new APIClient()

// Export fallback for when API is disabled
export async function getManPageLocal(name: string, section?: number) {
  // This will use the local data
  const { getManPage } = await import('@/data/man-pages')
  return getManPage(name, section)
}

export async function searchManPagesLocal(query: string) {
  // This will use the local search
  const { searchManPages } = await import('@/data/man-pages')
  return searchManPages(query)
}