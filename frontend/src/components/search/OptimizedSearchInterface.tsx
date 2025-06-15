import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MagnifyingGlassIcon, Cross2Icon } from "@radix-ui/react-icons";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useDebounce } from "@/utils/useDebounce";
import { useSearchStore } from "@/stores/searchStore";
import { useAppStore } from "@/stores/appStore";
import { cn } from "@/utils/cn";
import type { SearchFilters } from "@/types";
import { searchDocuments } from "@/services/api";
import { VirtualizedDocumentList } from "@/components/ui/VirtualizedList";
import { OptimizedLoader } from "@/components/ui/OptimizedLoader";

interface OptimizedSearchInterfaceProps {
  className?: string;
  autoFocus?: boolean;
  onSearch?: (query: string, filters: SearchFilters) => void;
}

// Memoized filter chip component
const FilterChip = React.memo<{
  label: string;
  value: string;
  isActive: boolean;
  onClick: () => void;
}>(({ label, value, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      "px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 transform",
      "hover:scale-105 active:scale-95",
      isActive
        ? "bg-blue-500 text-white shadow-md"
        : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
    )}
  >
    {label}
  </button>
));

FilterChip.displayName = 'FilterChip';

export const OptimizedSearchInterface: React.FC<OptimizedSearchInterfaceProps> = ({
  className,
  autoFocus = false,
  onSearch,
}) => {
  const navigate = useNavigate();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const {
    query,
    filters,
    loading: isSearching,
    history: searchHistory,
    recent: recentSearches,
    setQuery,
    updateFilters: setFilters,
    setLoading: setIsSearching,
    performSearch,
    clearRecent: clearHistory,
  } = useSearchStore();

  const { addToast } = useAppStore();

  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);

  // Debounce search query
  const debouncedQuery = useDebounce(query, 300);

  // Section options
  const sections = useMemo(() => [
    { label: "All", value: "all" },
    { label: "Section 1", value: "1" },
    { label: "Section 2", value: "2" },
    { label: "Section 3", value: "3" },
    { label: "Section 4", value: "4" },
    { label: "Section 5", value: "5" },
    { label: "Section 6", value: "6" },
    { label: "Section 7", value: "7" },
    { label: "Section 8", value: "8" },
  ], []);

  // Generate suggestions based on query and history
  const generateSuggestions = useCallback((searchQuery: string) => {
    // Get recent document names or search history
    const recentDocNames = recentSearches?.map(doc => 
      typeof doc === 'string' ? doc : doc?.name || ''
    ).filter(Boolean) || [];
    
    const historySuggestions = searchHistory || [];
    
    if (!searchQuery.trim()) {
      // Show combination of recent docs and search history
      const combined = [...new Set([...recentDocNames, ...historySuggestions])];
      return combined.slice(0, 5);
    }

    const lowerQuery = searchQuery.toLowerCase();
    
    // Combine recent searches, history and common commands
    const commonCommands = ['ls', 'grep', 'find', 'sed', 'awk', 'curl', 'wget', 'git', 'docker', 'npm'];
    const allSuggestions = [...new Set([...recentDocNames, ...historySuggestions, ...commonCommands])];
    
    // Filter and sort by relevance
    const filtered = allSuggestions
      .filter(s => s.toLowerCase().includes(lowerQuery))
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(lowerQuery);
        const bStarts = b.toLowerCase().startsWith(lowerQuery);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.length - b.length;
      })
      .slice(0, 5);

    return filtered;
  }, [recentSearches, searchHistory]);

  // Update suggestions when query changes
  useEffect(() => {
    if (query.trim()) {
      const newSuggestions = generateSuggestions(query);
      setSuggestions(newSuggestions);
    } else {
      setSuggestions(recentSearches.slice(0, 5));
    }
  }, [query, generateSuggestions, recentSearches]);

  // Perform search
  const handlePerformSearch = useCallback(async (searchQuery: string, searchFilters: SearchFilters) => {
    if (!searchQuery.trim()) return;

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController();

    try {
      setIsSearching(true);
      // Search history is automatically added by performSearch
      
      // Call custom onSearch handler if provided
      if (onSearch) {
        onSearch(searchQuery, searchFilters);
      } else {
        // Default navigation
        const params = new URLSearchParams({
          q: searchQuery,
          ...(searchFilters.section && searchFilters.section !== 'all' ? { section: searchFilters.section } : {}),
          limit: searchFilters.limit?.toString() || '20',
        });
        navigate(`/search?${params.toString()}`);
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Search error:', error);
        addToast('Search failed. Please try again.', 'error');
      }
    } finally {
      setIsSearching(false);
    }
  }, [onSearch, navigate, setIsSearching, addToast]);

  // Handle search submission
  const handleSearch = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    if (debouncedQuery.trim()) {
      performSearch(debouncedQuery, filters);
      setShowSuggestions(false);
    }
  }, [debouncedQuery, filters, performSearch]);

  // Handle suggestion selection
  const handleSuggestionClick = useCallback((suggestion: string) => {
    setQuery(suggestion);
    performSearch(suggestion, filters);
    setShowSuggestions(false);
    searchInputRef.current?.blur();
  }, [setQuery, filters, performSearch]);

  // Keyboard navigation for suggestions
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedSuggestionIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedSuggestionIndex(prev => 
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
        break;
      case 'Enter':
        if (selectedSuggestionIndex >= 0) {
          e.preventDefault();
          handleSuggestionClick(suggestions[selectedSuggestionIndex]);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setSelectedSuggestionIndex(-1);
        break;
    }
  }, [showSuggestions, suggestions, selectedSuggestionIndex, handleSuggestionClick]);

  // Handle filter changes
  const handleFilterChange = useCallback((key: keyof SearchFilters, value: any) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    
    // Trigger search immediately if query exists
    if (query.trim()) {
      performSearch(query, newFilters);
    }
  }, [filters, query, setFilters, performSearch]);

  // Clear search
  const handleClear = useCallback(() => {
    setQuery("");
    setShowSuggestions(false);
    setSelectedSuggestionIndex(-1);
    searchInputRef.current?.focus();
  }, [setQuery]);

  // Auto-focus on mount if specified
  useEffect(() => {
    if (autoFocus && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [autoFocus]);

  // Effect for auto-search on debounced query change
  useEffect(() => {
    if (debouncedQuery.trim() && debouncedQuery.length >= 2) {
      performSearch(debouncedQuery, filters);
    }
  }, [debouncedQuery, filters, performSearch]);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return (
    <div className={cn("relative", className)}>
      <form onSubmit={handleSearch} className="space-y-4">
        {/* Search Input */}
        <div className="relative">
          <div className="relative flex items-center">
            <div className="absolute left-3 text-gray-400">
              <MagnifyingGlassIcon className="w-5 h-5" />
            </div>
            <Input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowSuggestions(true);
                setSelectedSuggestionIndex(-1);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => {
                // Delay to allow clicking on suggestions
                setTimeout(() => setShowSuggestions(false), 200);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search man pages... (e.g., ls, grep, docker)"
              className="pl-10 pr-10 py-3 text-lg transition-all duration-200 focus:ring-2 focus:ring-primary-500/50"
              aria-label="Search man pages"
              aria-autocomplete="list"
              aria-controls="search-suggestions"
              aria-expanded={showSuggestions}
            />
            {query && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                aria-label="Clear search"
              >
                <Cross2Icon className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Search Suggestions */}
          <>
            {showSuggestions && suggestions.length > 0 && (
              <div id="search-suggestions" className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden z-50"
              >
                {suggestions.map((suggestion, index) => (
                  <button key={suggestion}
                    type="button"
                    onClick={() => handleSuggestionClick(suggestion)}
                    onMouseEnter={() => setSelectedSuggestionIndex(index)}
                    className={cn(
                      "w-full px-4 py-2 text-left text-sm transition-all duration-150",
                      "hover:bg-gray-100 dark:hover:bg-gray-700 hover:pl-5",
                      selectedSuggestionIndex === index && "bg-gray-100 dark:bg-gray-700 pl-5"
                    )}
                    role="option"
                    aria-selected={selectedSuggestionIndex === index}
                  >
                    <div className="flex items-center space-x-2">
                      <MagnifyingGlassIcon className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-700 dark:text-gray-300">{suggestion}</span>
                      {recentSearches.includes(suggestion) && (
                        <Badge variant="secondary" className="text-xs">
                          Recent
                        </Badge>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        </div>

        {/* Section Filters with improved performance */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-2 scrollbar-hide">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400 flex-shrink-0">
            Section:
          </span>
          <div className="flex space-x-2">
            {sections.map((section) => (
              <FilterChip key={section.value}
                    label={section.label}
                value={section.value}
                isActive={(filters.section || 'all') === section.value}
                onClick={() => handleFilterChange('section', section.value)}
              />
            ))}
          </div>
        </div>

        {/* Search Button (for mobile) */}
        <Button
          type="submit"
          className="w-full sm:hidden"
          disabled={!query.trim() || isSearching}
        >
          {isSearching ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
            />
          ) : (
            <>
              <MagnifyingGlassIcon className="w-5 h-5 mr-2" />
              Search
            </>
          )}
        </Button>
      </form>

      {/* Recent Searches (when input is empty) */}
      {!query && recentSearches.length > 0 && showSuggestions && (
        <div className="absolute top-full left-0 right-0 mt-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Recent Searches
            </h3>
            <button
              onClick={clearHistory}
              className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              Clear
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {recentSearches.slice(0, 5).map((search) => (
              <Badge key={search}
                    variant="secondary"
                className="cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                onClick={() => handleSuggestionClick(search)}
              >
                {search}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};