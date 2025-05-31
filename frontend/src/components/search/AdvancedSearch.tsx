import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MagnifyingGlassIcon, MixIcon, Cross2Icon, UpdateIcon, MagicWandIcon, ActivityLogIcon, ClockIcon, CodeIcon } from '@radix-ui/react-icons';
import { motion, AnimatePresence } from 'framer-motion';
import { useDebounce } from '@/utils/useDebounce';
import { useSearchStore } from '@/stores/searchStore';
import { searchAPI } from '@/services/api';
import { cn } from '../../utils/cn';

interface SearchSuggestion {
  value: string;
  label: string;
  type: 'command' | 'pattern' | 'recent' | 'trending';
  count?: number;
  icon?: React.ReactNode;
}

interface SearchFilter {
  id: string;
  label: string;
  type: 'section' | 'cached' | 'popular';
  value: any;
  active: boolean;
}

export const AdvancedSearch: React.FC = () => {
  const searchStore = useSearchStore();
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1);
  const [filters, setFilters] = useState<SearchFilter[]>([
    { id: 'sec1', label: 'Commands', type: 'section', value: 1, active: false },
    { id: 'sec2', label: 'System Calls', type: 'section', value: 2, active: false },
    { id: 'sec3', label: 'Libraries', type: 'section', value: 3, active: false },
    { id: 'cached', label: 'Cached Only', type: 'cached', value: true, active: false },
    { id: 'popular', label: 'Popular', type: 'popular', value: true, active: false },
  ]);
  
  const debouncedQuery = useDebounce(query, 300);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Fetch suggestions
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (debouncedQuery.length < 2) {
        setSuggestions([]);
        return;
      }

      try {
        const response = await searchAPI.suggest(debouncedQuery);
        const apiSuggestions = response.map((s: any) => ({
          ...s,
          icon: s.type === 'command' ? <CodeIcon className="w-4 h-4" /> : <MagnifyingGlassIcon className="w-4 h-4" />
        }));

        // Add recent searches
        const recentSearches = searchStore.getRecentSearches()
          .filter(s => s.toLowerCase().includes(debouncedQuery.toLowerCase()))
          .slice(0, 3)
          .map(s => ({
            value: s,
            label: s,
            type: 'recent' as const,
            icon: <ClockIcon className="w-4 h-4" />
          }));

        setSuggestions([...recentSearches, ...apiSuggestions]);
      } catch (error) {
        console.error('Failed to fetch suggestions:', error);
      }
    };

    fetchSuggestions();
  }, [debouncedQuery]);

  // Handle search
  const handleSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setShowSuggestions(false);
    
    // Build filters
    const activeFilters: any = {};
    const sections = filters.filter(f => f.type === 'section' && f.active).map(f => f.value);
    if (sections.length > 0) activeFilters.sections = sections;
    if (filters.find(f => f.id === 'cached')?.active) activeFilters.cached_only = true;
    if (filters.find(f => f.id === 'popular')?.active) activeFilters.min_popularity = 10;

    try {
      await searchStore.search(searchQuery, activeFilters);
      searchStore.addRecentSearch(searchQuery);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  }, [filters]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (selectedSuggestion >= 0 && suggestions[selectedSuggestion]) {
        setQuery(suggestions[selectedSuggestion].value);
        handleSearch(suggestions[selectedSuggestion].value);
      } else {
        handleSearch(query);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestion(prev => 
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestion(prev => prev > -1 ? prev - 1 : -1);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      searchInputRef.current?.blur();
    }
  };

  // Toggle filter
  const toggleFilter = (filterId: string) => {
    setFilters(prev => prev.map(f => 
      f.id === filterId ? { ...f, active: !f.active } : f
    ));
  };

  // Clear all filters
  const clearFilters = () => {
    setFilters(prev => prev.map(f => ({ ...f, active: false })));
  };

  const activeFilterCount = filters.filter(f => f.active).length;

  return (
    <div className="relative w-full max-w-4xl mx-auto">
      {/* Search Input Container */}
      <motion.div
        initial={false}
        animate={{
          scale: isFocused ? 1.02 : 1,
          boxShadow: isFocused 
            ? '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            : '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
        }}
        transition={{ duration: 0.2 }}
        className="relative bg-white dark:bg-gray-800 rounded-2xl overflow-hidden"
      >
        {/* Search Input */}
        <div className="relative flex items-center">
          <div className="absolute left-4 pointer-events-none">
            {isSearching ? (
              <UpdateIcon className="w-5 h-5 text-gray-400 animate-spin" />
            ) : (
              <MagnifyingGlassIcon className="w-5 h-5 text-gray-400" />
            )}
          </div>
          
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowSuggestions(true);
              setSelectedSuggestion(-1);
            }}
            onFocus={() => {
              setIsFocused(true);
              setShowSuggestions(true);
            }}
            onBlur={() => {
              setIsFocused(false);
              // Delay to allow clicking on suggestions
              setTimeout(() => setShowSuggestions(false), 200);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search commands, man pages, or documentation..."
            className="w-full pl-12 pr-24 py-4 text-lg bg-transparent border-none outline-none placeholder-gray-400 dark:placeholder-gray-500"
          />
          
          {/* Actions */}
          <div className="absolute right-4 flex items-center gap-2">
            {query && (
              <button
                onClick={() => {
                  setQuery('');
                  searchInputRef.current?.focus();
                }}
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <Cross2Icon className="w-4 h-4 text-gray-400" />
              </button>
            )}
            
            <button
              onClick={() => handleSearch(query)}
              disabled={!query.trim() || isSearching}
              className={cn(
                "px-4 py-2 rounded-lg font-medium transition-all",
                query.trim() && !isSearching
                  ? "bg-blue-600 text-white hover:bg-blue-700 shadow-lg hover:shadow-xl"
                  : "bg-gray-100 text-gray-400 dark:bg-gray-700 cursor-not-allowed"
              )}
            >
              Search
            </button>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-3 flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-500 dark:text-gray-400 mr-2">Filters:</span>
          
          {filters.map(filter => (
            <motion.button
              key={filter.id}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => toggleFilter(filter.id)}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm font-medium transition-all",
                filter.active
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                  : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
              )}
            >
              {filter.label}
            </motion.button>
          ))}
          
          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="ml-auto text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              Clear all ({activeFilterCount})
            </button>
          )}
        </div>
      </motion.div>

      {/* Suggestions Dropdown */}
      <AnimatePresence>
        {showSuggestions && suggestions.length > 0 && (
          <motion.div
            ref={suggestionsRef}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 rounded-xl shadow-2xl overflow-hidden z-50"
          >
            <div className="py-2">
              {suggestions.map((suggestion, index) => (
                <motion.button
                  key={`${suggestion.type}-${suggestion.value}`}
                  whileHover={{ backgroundColor: 'rgba(0, 0, 0, 0.03)' }}
                  onClick={() => {
                    setQuery(suggestion.value);
                    handleSearch(suggestion.value);
                  }}
                  className={cn(
                    "w-full px-4 py-3 flex items-center gap-3 text-left transition-colors",
                    selectedSuggestion === index && "bg-gray-50 dark:bg-gray-700"
                  )}
                >
                  <div className="flex-shrink-0 text-gray-400">
                    {suggestion.icon}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {suggestion.label}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {suggestion.type === 'recent' && 'Recent search'}
                      {suggestion.type === 'command' && `Command${suggestion.count ? ` • ${suggestion.count} results` : ''}`}
                      {suggestion.type === 'pattern' && 'Search pattern'}
                      {suggestion.type === 'trending' && 'Trending'}
                    </div>
                  </div>
                  
                  {suggestion.type === 'trending' && (
                    <ActivityLogIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
                  )}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick Tips */}
      {!query && isFocused && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute top-full left-0 right-0 mt-4 flex items-center justify-center gap-6 text-sm text-gray-500 dark:text-gray-400"
        >
          <div className="flex items-center gap-2">
            <MagicWandIcon className="w-4 h-4" />
            <span>Try "ls", "grep", or "docker"</span>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">↑↓</kbd>
            <span>Navigate</span>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">Enter</kbd>
            <span>Search</span>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">Esc</kbd>
            <span>Close</span>
          </div>
        </motion.div>
      )}
    </div>
  );
};