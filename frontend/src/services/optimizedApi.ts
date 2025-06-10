import { get, post, put, del, prefetch, clearCache } from '@/utils/optimizedApi';
import type {
  SearchResult,
  Document,
  HealthStatus,
  ApiResponse,
  SearchFilters,
} from '@/types';

// Search API with caching and optimization
export const searchAPI = {
  search: async (
    query: string,
    options: {
      page?: number;
      per_page?: number;
      section?: string;
      doc_set?: string[];
    } = {}
  ): Promise<SearchResult> => {
    const params = {
      q: query,
      page: options.page || 1,
      per_page: options.per_page || 20,
      ...(options.section && { section: options.section }),
      ...(options.doc_set && { doc_set: options.doc_set.join(',') }),
    };

    return get<SearchResult>('/api/search', {
      params,
      cache: {
        ttl: 300000, // Cache for 5 minutes
        key: `search:${JSON.stringify(params)}`,
      },
    });
  },

  suggestions: async (prefix: string): Promise<string[]> => {
    return get<string[]>(`/api/search/suggestions`, {
      params: { prefix },
      cache: {
        ttl: 600000, // Cache for 10 minutes
        key: `suggestions:${prefix}`,
      },
    });
  },

  popular: async (): Promise<any[]> => {
    return get<any[]>('/api/search/popular', {
      cache: {
        ttl: 1800000, // Cache for 30 minutes
      },
    });
  },
};

// Document API with intelligent caching
export const documentAPI = {
  get: async (name: string, section: string): Promise<Document> => {
    return get<Document>(`/api/documents/${name}/${section}`, {
      cache: {
        ttl: 3600000, // Cache for 1 hour
        key: `doc:${name}:${section}`,
      },
    });
  },

  list: async (params?: {
    page?: number;
    per_page?: number;
    section?: string;
  }): Promise<ApiResponse<Document[]>> => {
    return get<ApiResponse<Document[]>>('/api/documents', {
      params,
      cache: {
        ttl: 600000, // Cache for 10 minutes
      },
    });
  },

  recent: async (): Promise<Document[]> => {
    return get<Document[]>('/api/documents/recent', {
      cache: {
        ttl: 300000, // Cache for 5 minutes
      },
    });
  },

  popular: async (): Promise<Document[]> => {
    return get<Document[]>('/api/documents/popular', {
      cache: {
        ttl: 1800000, // Cache for 30 minutes
      },
    });
  },

  related: async (name: string): Promise<Document[]> => {
    return get<Document[]>(`/api/documents/${name}/related`, {
      cache: {
        ttl: 3600000, // Cache for 1 hour
      },
    });
  },
};

// Analytics API (no caching for real-time data)
export const analyticsAPI = {
  track: async (event: any): Promise<void> => {
    return post('/api/analytics/track', event, {
      invalidateCache: [], // Don't cache analytics
    });
  },

  getStats: async (): Promise<any> => {
    return get('/api/analytics/stats', {
      cache: false, // Always fresh
    });
  },

  getSearchMetrics: async (): Promise<any> => {
    return get('/api/analytics/search-metrics', {
      cache: {
        ttl: 60000, // Cache for 1 minute
      },
    });
  },
};

// Health API
export const healthAPI = {
  check: async (): Promise<HealthStatus> => {
    return get<HealthStatus>('/health', {
      cache: false, // Always check fresh
    });
  },

  metrics: async (): Promise<any> => {
    return get('/metrics', {
      cache: {
        ttl: 5000, // Cache for 5 seconds
      },
    });
  },
};

// Favorites API with cache invalidation
export const favoritesAPI = {
  list: async (): Promise<Document[]> => {
    return get<Document[]>('/api/favorites', {
      cache: {
        ttl: 300000, // Cache for 5 minutes
        key: 'favorites',
      },
    });
  },

  add: async (documentId: string): Promise<void> => {
    return post(`/api/favorites/${documentId}`, undefined, {
      invalidateCache: ['favorites'],
    });
  },

  remove: async (documentId: string): Promise<void> => {
    return del(`/api/favorites/${documentId}`, {
      invalidateCache: ['favorites'],
    });
  },
};

// Prefetch commonly accessed data
export const prefetchCommonData = async () => {
  // Prefetch popular documents
  await prefetch('/api/documents/popular');
  
  // Prefetch recent documents
  await prefetch('/api/documents/recent');
  
  // Prefetch popular search terms
  await prefetch('/api/search/popular');
};

// Export cache utilities
export { clearCache } from '@/utils/optimizedApi';