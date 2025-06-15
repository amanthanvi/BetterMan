// Simple search store implementation without Zustand to avoid initialization issues

import type { SearchState, Document, SearchFilters, SearchResult } from '@/types';
import { searchAPI } from '@/utils/apiWrapper';
import { useEffect, useState } from 'react';

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

// Default state
const defaultState: SearchState = {
  query: '',
  results: [],
  loading: false,
  error: null,
  filters: {},
  suggestions: [],
  history: [],
  recent: [],
};

// Store implementation
class SearchStoreImpl {
  private state: SearchState;
  private listeners: Set<(state: SearchState) => void> = new Set();

  constructor() {
    this.state = { ...defaultState };
  }

  getState = () => this.state;

  setState = (partial: Partial<SearchState> | ((state: SearchState) => Partial<SearchState>)) => {
    const update = typeof partial === 'function' ? partial(this.state) : partial;
    this.state = { ...this.state, ...update };
    this.listeners.forEach(listener => listener(this.state));
  };

  subscribe = (listener: (state: SearchState) => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  // Search actions
  setQuery = (query: string) => this.setState({ query });

  performSearch = async (query: string, filters: SearchFilters = {}) => {
    // Allow empty queries to browse all documents
    
    this.setState({ loading: true, error: null, query });
    
    try {
      // Check if this is a shortcut (starts with !)
      if (query.startsWith('!') && query.length > 1) {
        // Use instant search API for shortcuts
        const instantResult = await searchAPI.instantSearch(query, 10);
        
        if (instantResult.shortcuts && instantResult.shortcuts.length > 0) {
          // Handle shortcut navigation
          const shortcut = instantResult.shortcuts[0];
          if (shortcut.document) {
            // Navigate directly to the document
            window.location.href = `/docs/${shortcut.document.name}`;
            return;
          }
        }
        
        // If no shortcut found, treat as regular search for the command without !
        const commandQuery = query.substring(1);
        const result = await searchAPI.search(commandQuery, {
          page: 1,
          per_page: 20,
          ...filters,
        });
        
        this.setState({ 
          results: result.results,
          loading: false,
          error: null,
          query: commandQuery, // Update query without the !
        });
      } else {
        // Regular search
        const result = await searchAPI.search(query, {
          page: 1,
          per_page: 20,
          ...filters,
        });
        
        this.setState({ 
          results: result.results,
          loading: false,
          error: null,
        });
      }
      
      // Add to search history
      const currentHistory = this.state.history;
      if (!currentHistory.includes(query)) {
        this.setState({ 
          history: [query, ...currentHistory.slice(0, 19)] // Keep last 20
        });
      }
    } catch (error) {
      this.setState({ 
        loading: false, 
        error: error instanceof Error ? error.message : 'Search failed',
        results: []
      });
    }
  };

  clearResults = () => this.setState({ results: [], query: '', error: null });
  setLoading = (loading: boolean) => this.setState({ loading });
  setError = (error: string | null) => this.setState({ error });

  // Filter actions
  updateFilters = (newFilters: Partial<SearchFilters>) => {
    this.setState({ filters: { ...this.state.filters, ...newFilters } });
  };

  clearFilters = () => this.setState({ filters: {} });

  // Suggestions actions
  fetchSuggestions = async (query: string) => {
    if (!query.trim() || query.length < 2) {
      this.setState({ suggestions: [] });
      return;
    }
    
    try {
      // Try to fetch suggestions from API
      const apiSuggestions = await searchAPI.suggest(query);
      
      // Merge with search history
      const history = this.state.history;
      const historySuggestions = history
        .filter(h => h.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 3);
      
      // Combine and deduplicate
      const allSuggestions = [...new Set([...apiSuggestions, ...historySuggestions])].slice(0, 10);
      this.setState({ suggestions: allSuggestions });
    } catch (error) {
      console.error('Failed to fetch suggestions:', error);
      
      // Fallback to local suggestions
      const history = this.state.history;
      const suggestions = history
        .filter(h => h.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 5);
      
      // Add popular commands that match
      const popularCommands = ['ls', 'cd', 'grep', 'find', 'cat', 'vim', 'git', 'ssh', 'tar', 'curl'];
      const commandSuggestions = popularCommands
        .filter(cmd => cmd.includes(query.toLowerCase()))
        .slice(0, 3);
      
      const allSuggestions = [...new Set([...suggestions, ...commandSuggestions])];
      this.setState({ suggestions: allSuggestions });
    }
  };

  clearSuggestions = () => this.setState({ suggestions: [] });

  // Recent/history actions
  addToRecent = (doc: Document) => {
    const filtered = this.state.recent.filter(d => d.id !== doc.id);
    this.setState({ recent: [doc, ...filtered].slice(0, 10) }); // Keep last 10
  };

  clearRecent = () => this.setState({ recent: [] });
}

// Create single instance
const searchStore = new SearchStoreImpl();

// React hook
export function useSearchStore(): SearchStore {
  const [state, setState] = useState(searchStore.getState());

  useEffect(() => {
    return searchStore.subscribe(setState);
  }, []);

  return {
    ...state,
    setQuery: searchStore.setQuery,
    performSearch: searchStore.performSearch,
    clearResults: searchStore.clearResults,
    setLoading: searchStore.setLoading,
    setError: searchStore.setError,
    updateFilters: searchStore.updateFilters,
    clearFilters: searchStore.clearFilters,
    fetchSuggestions: searchStore.fetchSuggestions,
    clearSuggestions: searchStore.clearSuggestions,
    addToRecent: searchStore.addToRecent,
    clearRecent: searchStore.clearRecent,
  };
}