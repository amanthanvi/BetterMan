import React, { useState, useEffect, useRef } from 'react';
import { 
  MagnifyingGlassIcon, 
  MixerHorizontalIcon,
  ClockIcon,
  Cross2Icon,
  CodeIcon,
  BookmarkIcon
} from '@radix-ui/react-icons';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useSearchStore } from '@/stores/searchStore';
import { useAppStore } from '@/stores/appStore';
import { useDebounce } from '@/utils/useDebounce';
import { cn } from '@/utils/cn';
import type { Document } from '@/types';

interface SearchInterfaceProps {
  onSearch?: (query: string) => void;
  className?: string;
  showFilters?: boolean;
  compact?: boolean;
}

export const SearchInterface: React.FC<SearchInterfaceProps> = ({
  onSearch,
  className,
  showFilters = true,
  compact = false,
}) => {
  const [localQuery, setLocalQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1);
  const [showHistory, setShowHistory] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  
  const {
    query,
    results,
    loading,
    error,
    suggestions,
    history,
    recent,
    performSearch,
    fetchSuggestions,
    clearSuggestions,
  } = useSearchStore();
  
  const { 
    searchHistory, 
    addSearchHistory,
    isFavorite,
    setCommandPaletteOpen,
    preferences
  } = useAppStore();
  
  const debouncedQuery = useDebounce(localQuery, 300);
  
  // Sync with store
  useEffect(() => {
    setLocalQuery(query);
  }, [query]);
  
  // Fetch suggestions when query changes
  useEffect(() => {
    if (debouncedQuery && debouncedQuery.length > 1) {
      fetchSuggestions(debouncedQuery);
      setShowSuggestions(true);
    } else {
      clearSuggestions();
      setShowSuggestions(false);
    }
  }, [debouncedQuery, fetchSuggestions, clearSuggestions]);
  
  // Handle search
  const handleSearch = async (searchQuery: string = localQuery) => {
    if (!searchQuery.trim()) return;
    
    setShowSuggestions(false);
    setShowHistory(false);
    
    await performSearch(searchQuery);
    addSearchHistory(searchQuery);
    
    if (onSearch) {
      onSearch(searchQuery);
    }
  };
  
  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocalQuery(value);
    setSelectedSuggestion(-1);
    
    if (!value.trim()) {
      setShowSuggestions(false);
      setShowHistory(true);
    }
  };
  
  // Handle input focus
  const handleInputFocus = () => {
    if (!localQuery.trim() && searchHistory.length > 0) {
      setShowHistory(true);
    } else if (localQuery.trim() && suggestions.length > 0) {
      setShowSuggestions(true);
    }
  };
  
  // Handle input blur
  const handleInputBlur = (e: React.FocusEvent) => {
    // Delay hiding to allow clicking on suggestions
    setTimeout(() => {
      if (!suggestionsRef.current?.contains(e.relatedTarget as Node)) {
        setShowSuggestions(false);
        setShowHistory(false);
      }
    }, 200);
  };
  
  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowSuggestions(false);
      setShowHistory(false);
      inputRef.current?.blur();
      return;
    }
    
    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedSuggestion >= 0) {
        const suggestion = showHistory 
          ? searchHistory[selectedSuggestion]
          : suggestions[selectedSuggestion];
        if (suggestion) {
          setLocalQuery(suggestion);
          handleSearch(suggestion);
        }
      } else {
        handleSearch();
      }
      return;
    }
    
    const items = showHistory ? searchHistory : suggestions;
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestion(prev => 
        prev < items.length - 1 ? prev + 1 : prev
      );
    }
    
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestion(prev => prev > 0 ? prev - 1 : -1);
    }
    
    // Command palette shortcut
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setCommandPaletteOpen(true);
    }
  };
  
  // Handle suggestion click
  const handleSuggestionClick = (suggestion: string) => {
    setLocalQuery(suggestion);
    handleSearch(suggestion);
  };
  
  // Recent documents with search
  const filteredRecent = recent.filter(doc =>
    localQuery.trim() ? 
      doc.title.toLowerCase().includes(localQuery.toLowerCase()) ||
      doc.summary.toLowerCase().includes(localQuery.toLowerCase())
    : true
  ).slice(0, 3);
  
  const showDropdown = (showSuggestions && suggestions.length > 0) || 
                      (showHistory && searchHistory.length > 0) ||
                      (localQuery.trim() && filteredRecent.length > 0);
  
  return (
    <div className={cn('relative w-full max-w-2xl', className)}>
      {/* Search Input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          {loading ? (
            <div>
              <MagnifyingGlassIcon className="w-5 h-5 text-gray-400" />
            </div>
          ) : (
            <MagnifyingGlassIcon className="w-5 h-5 text-gray-400" />
          )}
        </div>
        
        <input ref={inputRef}
          type="text"
          value={localQuery}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          placeholder="Search documentation... (⌘K for command palette)"
          className={cn(
            'block w-full pl-10 pr-12 py-3 border border-gray-300 rounded-xl',
            'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100',
            'placeholder-gray-500 dark:placeholder-gray-400',
            'focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
            'dark:border-gray-600 dark:focus:border-blue-400',
            'transition-all duration-200',
            compact && 'py-2 text-sm',
            error && 'border-red-300 focus:border-red-500 focus:ring-red-500'
          )} />
        
        <div className="absolute inset-y-0 right-0 flex items-center space-x-1 pr-3">
          {localQuery && (
            <button
              onClick={() => {
                setLocalQuery('');
                setShowSuggestions(false);
                setShowHistory(false);
                inputRef.current?.focus();
              }}
              className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <Cross2Icon className="w-4 h-4" />
            </button>
          )}
          
          {showFilters && (
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8"
              onClick={() => {/* TODO: Open filters */}}
            >
              <MixerHorizontalIcon className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
      
      {/* Error State */}
      {error && (
        <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
        >
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}
      
      {/* Suggestions Dropdown */}
      <>
        {showDropdown && (
          <div 
            ref={suggestionsRef}
            className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 z-50 max-h-96 overflow-y-auto"
          >
            {/* Search Suggestions */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="p-2">
                <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Suggestions
                </div>
                {suggestions.map((suggestion, index) => (
                  <SuggestionItem key={index}
                    suggestion={suggestion}
                    selected={selectedSuggestion === index}
                    onClick={() => handleSuggestionClick(suggestion)}
                    icon={<CodeIcon className="w-4 h-4" />}
                  />
                ))}
              </div>
            )}
            
            {/* Search History */}
            {showHistory && searchHistory.length > 0 && (
              <div className="p-2">
                <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Recent Searches
                </div>
                {searchHistory.slice(0, 5).map((historyItem, index) => (
                  <SuggestionItem key={index}
                    suggestion={historyItem}
                    selected={selectedSuggestion === index}
                    onClick={() => handleSuggestionClick(historyItem)}
                    icon={<ClockIcon className="w-4 h-4" />}
                  />
                ))}
              </div>
            )}
            
            {/* Recent Documents */}
            {localQuery.trim() && filteredRecent.length > 0 && (
              <div className="p-2 border-t border-gray-200 dark:border-gray-700">
                <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Recent Documents
                </div>
                {filteredRecent.map((doc) => (
                  <RecentDocItem key={doc.id}
                    doc={doc}
                    onClick={() => handleSuggestionClick(doc.title)}
                    isFavorite={isFavorite(doc.id)}
                  />
                ))}
              </div>
            )}
            
            {/* Keyboard shortcuts hint */}
            <div className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
              Press ↑↓ to navigate, ↵ to select, ⌘K for command palette
            </div>
          </div>
        )}
      </>
    </div>
  );
};

interface SuggestionItemProps {
  suggestion: string;
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}

const SuggestionItem: React.FC<SuggestionItemProps> = ({
  suggestion,
  selected,
  onClick,
  icon,
}) => {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors',
        'hover:bg-gray-100 dark:hover:bg-gray-700',
        selected && 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
      )}
    >
      <div className="text-gray-400 dark:text-gray-500">{icon}</div>
      <span className="font-mono text-sm">{suggestion}</span>
    </button>
  );
};

interface RecentDocItemProps {
  doc: Document;
  onClick: () => void;
  isFavorite: boolean;
}

const RecentDocItem: React.FC<RecentDocItemProps> = ({ doc, onClick, isFavorite }) => {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-start space-x-3 px-3 py-2 rounded-lg text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
    >
      <div className="text-gray-400 dark:text-gray-500 mt-0.5">
        <CodeIcon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center space-x-2">
          <span className="font-medium font-mono text-sm">{doc.title}</span>
          {isFavorite && (
            <BookmarkIcon className="w-3 h-3 text-blue-500" />
          )}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {doc.summary}
        </p>
      </div>
    </button>
  );
};