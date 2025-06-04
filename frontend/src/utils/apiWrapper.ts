/**
 * API wrapper to handle search requests
 */

import { searchAPI as originalSearchAPI } from '@/services/api';
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
      // Use original API directly - no proxy needed
      const result = await originalSearchAPI.search(query, options);
      
      // Cache successful results
      searchCache.set(cacheKey, { result, timestamp: Date.now() });
      
      // Clean up old cache entries
      if (searchCache.size > 50) {
        const sortedEntries = Array.from(searchCache.entries())
          .sort((a, b) => a[1].timestamp - b[1].timestamp);
        searchCache.delete(sortedEntries[0][0]);
      }
      
      return result;
    } catch (error) {
      console.error('Search API error:', error);
      
      // If we have a cached result, return it even if it's stale
      if (cached) {
        console.warn('Returning stale cached results due to error');
        return cached.result;
      }
      
      throw error;
    }
  },
  
  suggest: async (query: string): Promise<string[]> => {
    try {
      return await originalSearchAPI.suggest(query);
    } catch (error) {
      console.error('Suggest API error:', error);
      return [];
    }
  }
};