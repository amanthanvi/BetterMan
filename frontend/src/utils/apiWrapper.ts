/**
 * API wrapper to handle browser extension interference gracefully
 */

import { searchAPI as originalSearchAPI } from '@/services/api';
import { proxyAPI } from '@/utils/proxyApi';
import type { SearchResult } from '@/types';

// In-memory cache for search results
const searchCache = new Map<string, { result: SearchResult; timestamp: number }>();
const CACHE_TTL = 30000; // 30 seconds

export const searchAPI = {
  ...originalSearchAPI,
  
  search: async (
    query: string,
    options: {
      page?: number;
      per_page?: number;
      section?: number[];
      doc_set?: string[];
    } = {}
  ): Promise<SearchResult> => {
    const cacheKey = JSON.stringify({ query, options });
    
    // Check cache first
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log('Returning cached search results');
      return cached.result;
    }
    
    try {
      // Try proxy API first (which bypasses browser extension issues)
      const result = await proxyAPI.search(query, options);
      
      // Cache successful results
      searchCache.set(cacheKey, { result, timestamp: Date.now() });
      
      // Clean up old cache entries
      if (searchCache.size > 50) {
        const sortedEntries = Array.from(searchCache.entries())
          .sort((a, b) => a[1].timestamp - b[1].timestamp);
        searchCache.delete(sortedEntries[0][0]);
      }
      
      return result;
    } catch (proxyError) {
      console.warn('Proxy API failed, trying direct API:', proxyError);
      
      try {
        // Fallback to original API
        const result = await originalSearchAPI.search(query, options);
        searchCache.set(cacheKey, { result, timestamp: Date.now() });
        return result;
      } catch (error) {
        console.error('Search API error:', error);
        
        // If we have a cached result, return it even if it's stale
        if (cached) {
          console.warn('Returning stale cached results due to error');
          return cached.result;
        }
        
        // Return empty results as last resort
        return {
          results: [],
          total: 0,
          page: options.page || 1,
          per_page: options.per_page || 20,
          has_more: false,
          query: query
        };
      }
    }
  },
  
  suggest: async (query: string): Promise<string[]> => {
    try {
      // Try proxy API first
      return await proxyAPI.suggest(query);
    } catch (error) {
      console.warn('Proxy suggest failed, trying direct API:', error);
      try {
        return await originalSearchAPI.suggest(query);
      } catch {
        return [];
      }
    }
  }
};