import { create } from 'zustand';
import type { SearchState, Document, SearchFilters, SearchResult } from '@/types';
import { searchAPI } from '@/utils/apiWrapper';

interface SearchStore extends SearchState {
  // Search actions
  setQuery: (query: string) => void;
  performSearch: (query: string, filters?: SearchFilters) => Promise<void>;
  clearResults: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  
  // Filter actions
  updateFilters: (filters: Partial<SearchFilters>) => void;
  clearFilters: () => void;
  
  // Suggestions actions
  fetchSuggestions: (query: string) => Promise<void>;
  clearSuggestions: () => void;
  
  // Recent/history actions
  addToRecent: (doc: Document) => void;
  clearRecent: () => void;
}

export const useSearchStore = create<SearchStore>((set, get) => ({
  // Initial state
  query: '',
  results: [],
  loading: false,
  error: null,
  filters: {},
  suggestions: [],
  history: [],
  recent: [],
  
  // Search actions
  setQuery: (query: string) => set({ query }),
  
  performSearch: async (query: string, filters = {}) => {
    if (!query.trim()) {
      set({ results: [], query: '' });
      return;
    }
    
    set({ loading: true, error: null, query });
    
    try {
      const result = await searchAPI.search(query, {
        page: 1,
        per_page: 20,
        ...filters,
      });
      
      set({ 
        results: result.results,
        loading: false,
        error: null,
      });
      
      // Add to search history
      const currentHistory = get().history;
      if (!currentHistory.includes(query)) {
        set({ 
          history: [query, ...currentHistory.slice(0, 19)] // Keep last 20
        });
      }
    } catch (error) {
      set({ 
        loading: false, 
        error: error instanceof Error ? error.message : 'Search failed',
        results: []
      });
    }
  },
  
  clearResults: () => set({ results: [], query: '', error: null }),
  setLoading: (loading: boolean) => set({ loading }),
  setError: (error: string | null) => set({ error }),
  
  // Filter actions
  updateFilters: (newFilters: Partial<SearchFilters>) =>
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
    })),
    
  clearFilters: () => set({ filters: {} }),
  
  // Suggestions actions
  fetchSuggestions: async (query: string) => {
    if (!query.trim() || query.length < 2) {
      set({ suggestions: [] });
      return;
    }
    
    try {
      // Try to fetch suggestions from API
      const apiSuggestions = await searchAPI.suggest(query);
      
      // Merge with search history
      const history = get().history;
      const historySuggestions = history
        .filter(h => h.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 3);
      
      // Combine and deduplicate
      const allSuggestions = [...new Set([...apiSuggestions, ...historySuggestions])].slice(0, 10);
      set({ suggestions: allSuggestions });
    } catch (error) {
      console.error('Failed to fetch suggestions:', error);
      
      // Fallback to local suggestions
      const history = get().history;
      const suggestions = history
        .filter(h => h.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 5);
      
      // Add popular commands that match
      const popularCommands = ['ls', 'cd', 'grep', 'find', 'cat', 'vim', 'git', 'ssh', 'tar', 'curl'];
      const commandSuggestions = popularCommands
        .filter(cmd => cmd.includes(query.toLowerCase()))
        .slice(0, 3);
      
      const allSuggestions = [...new Set([...suggestions, ...commandSuggestions])];
      set({ suggestions: allSuggestions });
    }
  },
  
  clearSuggestions: () => set({ suggestions: [] }),
  
  // Recent/history actions
  addToRecent: (doc: Document) =>
    set((state) => {
      const filtered = state.recent.filter(d => d.id !== doc.id);
      return {
        recent: [doc, ...filtered].slice(0, 10), // Keep last 10
      };
    }),
    
  clearRecent: () => set({ recent: [] }),
}));