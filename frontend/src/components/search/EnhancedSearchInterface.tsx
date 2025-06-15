import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, History, TrendingUp, Filter, Sparkles } from 'lucide-react';
import { useSearchStore } from '@/stores/searchStore';
import { useAppStore } from '@/stores/appStore';
import { useDebounce } from '@/utils/useDebounce';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { cn } from '@/utils/cn';
import { api } from '@/services/api';

interface SearchSuggestion {
  type: 'command' | 'history' | 'trending';
  text: string;
  meta?: string;
}

export const EnhancedSearchInterface: React.FC = () => {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebounce(query, 300);
  
  const { performSearch, isSearching, addToHistory } = useSearchStore();
  const { user } = useAppStore();

  // Fetch suggestions
  useEffect(() => {
    if (debouncedQuery.length >= 2 && isFocused) {
      fetchSuggestions(debouncedQuery);
    } else if (debouncedQuery.length === 0 && isFocused) {
      // Show trending/history when input is empty
      showDefaultSuggestions();
    } else {
      setSuggestions([]);
    }
  }, [debouncedQuery, isFocused]);

  const fetchSuggestions = async (searchQuery: string) => {
    try {
      const response = await api.get('/search/suggest', {
        params: { q: searchQuery, limit: 5 }
      });
      
      const commandSuggestions: SearchSuggestion[] = response.data.suggestions.map((s: string) => ({
        type: 'command',
        text: s,
        meta: 'Command'
      }));
      
      setSuggestions(commandSuggestions);
    } catch (error) {
      console.error('Failed to fetch suggestions:', error);
    }
  };

  const showDefaultSuggestions = async () => {
    const defaultSuggestions: SearchSuggestion[] = [];
    
    // Add search history if user is logged in
    if (user) {
      try {
        const history = await api.get('/user/search-history', { params: { limit: 3 } });
        history.data.slice(0, 3).forEach((item: any) => {
          defaultSuggestions.push({
            type: 'history',
            text: item.query,
            meta: 'Recent'
          });
        });
      } catch (error) {
        console.error('Failed to fetch search history:', error);
      }
    }
    
    // Add trending commands
    const trending = ['git', 'docker', 'npm', 'ssh', 'curl'];
    trending.slice(0, 3).forEach(cmd => {
      defaultSuggestions.push({
        type: 'trending',
        text: cmd,
        meta: 'Trending'
      });
    });
    
    setSuggestions(defaultSuggestions);
  };

  const handleSearch = (searchQuery: string = query) => {
    if (searchQuery.trim()) {
      performSearch(searchQuery, { section: selectedSection });
      if (user) {
        addToHistory(searchQuery);
      }
      setSuggestions([]);
      setIsFocused(false);
      inputRef.current?.blur();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => 
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => prev > -1 ? prev - 1 : -1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && suggestions[selectedIndex]) {
        setQuery(suggestions[selectedIndex].text);
        handleSearch(suggestions[selectedIndex].text);
      } else {
        handleSearch();
      }
    } else if (e.key === 'Escape') {
      setIsFocused(false);
      inputRef.current?.blur();
    }
  };

  const sections = [
    { value: '1', label: 'User Commands', icon: '👤' },
    { value: '2', label: 'System Calls', icon: '⚙️' },
    { value: '3', label: 'Library Functions', icon: '📚' },
    { value: '4', label: 'Special Files', icon: '📄' },
    { value: '5', label: 'File Formats', icon: '📋' },
    { value: '6', label: 'Games', icon: '🎮' },
    { value: '7', label: 'Miscellaneous', icon: '📦' },
    { value: '8', label: 'Admin Commands', icon: '🔧' },
  ];

  return (
    <div className="relative w-full max-w-4xl mx-auto">
      <Card variant="glass" padding="none" className="overflow-visible">
        <div className="relative">
          <div className="relative flex items-center">
            <div className="absolute left-4 pointer-events-none">
              <Search className="w-5 h-5 text-gray-400" />
            </div>
            
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setTimeout(() => setIsFocused(false), 200)}
              onKeyDown={handleKeyDown}
              placeholder="Search commands, options, or descriptions..."
              className={cn(
                "w-full pl-12 pr-32 py-4 text-lg bg-transparent",
                "placeholder-gray-400 text-gray-900 dark:text-gray-100",
                "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset",
                "rounded-xl transition-all duration-200"
              )}
              aria-label="Search documentation"
              aria-autocomplete="list"
              aria-controls="search-suggestions"
              aria-expanded={isFocused && suggestions.length > 0}
            />
            
            <div className="absolute right-2 flex items-center gap-2">
              {query && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setQuery('')}
                  className="w-8 h-8"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
              
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowFilters(!showFilters)}
                className={cn(
                  "transition-colors",
                  showFilters && "bg-gray-100 dark:bg-gray-800"
                )}
                aria-label="Toggle filters"
                aria-expanded={showFilters}
              >
                <Filter className="w-4 h-4 mr-1" />
                Filters
              </Button>
              
              <Button
                size="sm"
                onClick={() => handleSearch()}
                loading={isSearching}
                aria-label="Search"
              >
                Search
              </Button>
            </div>
          </div>
          
          {/* Filter Section */}
          <>
            {showFilters && (
              <div}}}}
                className="overflow-hidden"
              >
                <div className="px-4 pb-4 pt-2 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Filter by section:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {sections.map((section) => (
                      <button
                        key={section.value}
                        onClick={() => setSelectedSection(
                          selectedSection === section.value ? null : section.value
                        )}
                        className={cn(
                          "inline-flex items-center px-3 py-1.5 rounded-lg text-sm",
                          "transition-colors duration-200",
                          selectedSection === section.value
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                        )}
                      >
                        <span className="mr-1.5">{section.icon}</span>
                        {section.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        </div>
      </Card>
      
      {/* Search Suggestions */}
      <>
        {isFocused && suggestions.length > 0 && (
          <div
            id="search-suggestions"}}}}
            className="absolute top-full left-0 right-0 mt-2 z-50"
          >
            <Card variant="elevated" padding="none" className="overflow-hidden">
              <ul role="listbox" className="py-2">
                {suggestions.map((suggestion, index) => (
                  <li
                    key={`${suggestion.type}-${suggestion.text}`}
                    role="option"
                    aria-selected={index === selectedIndex}
                  >
                    <button
                      onClick={() => {
                        setQuery(suggestion.text);
                        handleSearch(suggestion.text);
                      }}
                      className={cn(
                        "w-full px-4 py-3 flex items-center justify-between",
                        "hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors",
                        index === selectedIndex && "bg-gray-50 dark:bg-gray-800"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        {suggestion.type === 'history' && (
                          <History className="w-4 h-4 text-gray-400" />
                        )}
                        {suggestion.type === 'trending' && (
                          <TrendingUp className="w-4 h-4 text-blue-500" />
                        )}
                        {suggestion.type === 'command' && (
                          <Sparkles className="w-4 h-4 text-purple-500" />
                        )}
                        <span className="text-gray-900 dark:text-gray-100">
                          {suggestion.text}
                        </span>
                      </div>
                      {suggestion.meta && (
                        <Badge variant="default" size="sm">
                          {suggestion.meta}
                        </Badge>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}
      </>
    </div>
  );
};