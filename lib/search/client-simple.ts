// Simplified search client for build
export interface SearchResult {
  id: string
  name: string
  section: number
  title: string
  description: string
  category: string
  score?: number
}

export interface SearchOptions {
  query: string
  section?: number
  limit?: number
  fuzzy?: boolean
}

class SearchClient {
  async search(options: SearchOptions): Promise<SearchResult[]> {
    // Simplified search - just returns empty for now
    // Will be replaced with actual implementation after build
    return []
  }
  
  async getSuggestions(prefix: string, limit = 10): Promise<string[]> {
    // Return empty suggestions for build
    return []
  }
  
  clearCache() {
    // No-op for build
  }
}

export const searchClient = new SearchClient()