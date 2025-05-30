import type { SearchResult, Document, HealthStatus, ApiResponse, SearchFilters } from '@/types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Generic API client
class ApiClient {
  private baseURL: string;
  
  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }
  
  private async request<T>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };
    
    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      throw error;
    }
  }
  
  get<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
    const url = params ? `${endpoint}?${new URLSearchParams(params)}` : endpoint;
    return this.request<T>(url, { method: 'GET' });
  }
  
  post<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }
  
  put<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }
  
  delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

const apiClient = new ApiClient(API_BASE_URL);

// Search API
export const searchAPI = {
  search: async (
    query: string, 
    options: {
      page?: number;
      per_page?: number;
      section?: number[];
      doc_set?: string[];
    } = {}
  ): Promise<SearchResult> => {
    const params: Record<string, string> = {
      q: query,
      page: String(options.page || 1),
      per_page: String(options.per_page || 20),
    };
    
    if (options.section?.length) {
      params.section = options.section.join(',');
    }
    
    if (options.doc_set?.length) {
      params.doc_set = options.doc_set.join(',');
    }
    
    return apiClient.get<SearchResult>('/api/search', params);
  },
  
  suggest: async (query: string): Promise<string[]> => {
    if (!query.trim() || query.length < 2) return [];
    
    try {
      const result = await apiClient.get<{ suggestions: string[] }>('/api/search/suggest', { q: query });
      return result.suggestions || [];
    } catch (error) {
      console.error('Suggestions failed:', error);
      return [];
    }
  },
};

// Document API
export const documentAPI = {
  getDocument: async (docId: string): Promise<Document> => {
    return apiClient.get<Document>(`/api/docs/${docId}`);
  },
  
  getDocumentContent: async (docId: string): Promise<{ content: string }> => {
    return apiClient.get<{ content: string }>(`/api/docs/${docId}/content`);
  },
  
  getRelatedDocuments: async (docId: string): Promise<Document[]> => {
    const result = await apiClient.get<{ documents: Document[] }>(`/api/docs/${docId}/related`);
    return result.documents || [];
  },
};

// System API
export const systemAPI = {
  getHealth: (): Promise<HealthStatus> => {
    return apiClient.get<HealthStatus>('/health');
  },
  
  getStats: (): Promise<{
    total_documents: number;
    total_searches: number;
    popular_searches: string[];
  }> => {
    return apiClient.get('/api/stats');
  },
};

// Analytics API
export const analyticsAPI = {
  trackSearch: (query: string, resultCount: number): Promise<void> => {
    return apiClient.post('/api/analytics/search', {
      query,
      result_count: resultCount,
      timestamp: new Date().toISOString(),
    });
  },
  
  trackDocumentView: (docId: string): Promise<void> => {
    return apiClient.post('/api/analytics/view', {
      document_id: docId,
      timestamp: new Date().toISOString(),
    });
  },
};

// Cache management
class CacheManager {
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  
  set<T>(key: string, data: T, ttlMs = 5 * 60 * 1000): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
    });
  }
  
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data as T;
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  has(key: string): boolean {
    return this.get(key) !== null;
  }
}

export const cache = new CacheManager();

// Enhanced search API with caching
export const cachedSearchAPI = {
  search: async (query: string, options: any = {}): Promise<SearchResult> => {
    const cacheKey = `search:${query}:${JSON.stringify(options)}`;
    
    // Try cache first
    const cached = cache.get<SearchResult>(cacheKey);
    if (cached) {
      return cached;
    }
    
    // Fetch from API
    const result = await searchAPI.search(query, options);
    
    // Cache the result
    cache.set(cacheKey, result, 2 * 60 * 1000); // 2 minutes
    
    return result;
  },
};

export default apiClient;