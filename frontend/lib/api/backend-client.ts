/**
 * Backend API client for direct communication with Railway backend
 * No Supabase dependency - uses PostgreSQL backend directly
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-df7c.up.railway.app'
const USE_BACKEND = process.env.NEXT_PUBLIC_USE_BACKEND !== 'false'

export interface SearchResult {
  name: string
  section: string | number
  title: string
  description: string
  category: string
  snippet?: string
  score?: number
}

export interface ManPage {
  id?: number
  name: string
  section: string | number
  title: string
  description: string
  synopsis?: string
  content: string
  category: string
  is_common?: boolean
  complexity?: 'basic' | 'intermediate' | 'advanced'
  keywords?: string[]
  see_also?: Array<{ name: string; section: number }>
  related_commands?: string[]
  examples?: any[]
  options?: any[]
}

export interface Command {
  name: string
  section: string
  title: string
  category: string
  description?: string
}

export interface Category {
  category: string
  count: number
}

class BackendAPIClient {
  private baseURL: string

  constructor() {
    this.baseURL = API_URL
  }

  private async fetch<T>(path: string, options?: RequestInit): Promise<T> {
    if (!USE_BACKEND) {
      throw new Error('Backend API is disabled')
    }

    const url = `${this.baseURL}${path}`
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`API error: ${response.status} - ${errorText}`)
        throw new Error(`API error: ${response.statusText}`)
      }

      return response.json()
    } catch (error) {
      console.error('Fetch error:', error)
      throw error
    }
  }

  async search(query: string, options?: { 
    limit?: number
    section?: string 
  }): Promise<{
    query: string
    results: SearchResult[]
    total: number
  }> {
    const params = new URLSearchParams({
      q: query,
      ...(options?.limit && { limit: options.limit.toString() }),
      ...(options?.section && { section: options.section }),
    })
    
    return this.fetch(`/api/search?${params}`)
  }

  async getManPage(name: string, section?: string | number): Promise<ManPage | null> {
    try {
      // Try the primary endpoint format
      const sectionStr = section?.toString() || '1'
      const page = await this.fetch<ManPage>(`/api/man/${name}/${sectionStr}`)
      return page
    } catch (error) {
      // Try alternative endpoint format
      try {
        const sectionStr = section?.toString() || '1'
        const page = await this.fetch<ManPage>(`/api/man/commands/${name}/${sectionStr}`)
        return page
      } catch {
        console.error(`Failed to fetch man page: ${name}(${section})`)
        return null
      }
    }
  }

  async listCommands(options?: {
    limit?: number
    offset?: number
    category?: string
  }): Promise<{
    commands: Command[]
    total: number
    limit: number
    offset: number
  }> {
    const params = new URLSearchParams({
      limit: (options?.limit || 100).toString(),
      offset: (options?.offset || 0).toString(),
      ...(options?.category && { category: options.category }),
    })
    
    return this.fetch(`/api/man/commands?${params}`)
  }

  async getCommonCommands(): Promise<{ commands: Command[] }> {
    return this.fetch('/api/common')
  }

  async getCategories(): Promise<{ categories: Category[] }> {
    return this.fetch('/api/categories')
  }

  async getCategoryPages(category: string, limit = 50): Promise<{
    commands: Command[]
    total: number
  }> {
    const params = new URLSearchParams({ 
      category,
      limit: limit.toString() 
    })
    const result = await this.fetch<any>(`/api/man/commands?${params}`)
    return {
      commands: result.commands,
      total: result.total
    }
  }

  async getStats(): Promise<{
    total_pages: number
    total_sections: number
    total_categories: number
    common_commands: number
  }> {
    return this.fetch('/api/stats')
  }

  async healthCheck(): Promise<{ status: string }> {
    return this.fetch('/health')
  }
}

// Export singleton instance
export const backendClient = new BackendAPIClient()

// Export for backward compatibility
export const apiClient = backendClient