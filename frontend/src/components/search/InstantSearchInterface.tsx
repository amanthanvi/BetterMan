import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MagnifyingGlassIcon, 
  Cross2Icon,
  CodeIcon,
  BookmarkIcon,
  ClockIcon,
  LightningBoltIcon,
  QuestionMarkCircledIcon,
  RocketIcon,
  CheckIcon,
  ArrowRightIcon,
  ExclamationTriangleIcon,
  KeyboardIcon,
} from '@radix-ui/react-icons';
import { useNavigate } from 'react-router-dom';
import { useDebounce } from '@/utils/useDebounce';
import { useAppStore } from '@/stores/appStore';
import { searchAPI } from '@/services/api';
import { cn } from '@/utils/cn';
import type { Document } from '@/types';

interface InstantSearchInterfaceProps {
  className?: string;
  onClose?: () => void;
  autoFocus?: boolean;
  placeholder?: string;
}

export const InstantSearchInterface: React.FC<InstantSearchInterfaceProps> = ({
  className,
  onClose,
  autoFocus = true,
  placeholder = "Search docs, or type a question..."
}) => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showResults, setShowResults] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  
  const { 
    searchHistory, 
    addSearchHistory,
    recentDocuments,
    addRecentDocument,
    favorites,
  } = useAppStore();
  
  const debouncedQuery = useDebounce(query, 150); // Fast debounce for instant feel
  
  // Perform instant search
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults(null);
      setShowResults(false);
      return;
    }
    
    setLoading(true);
    setShowResults(true);
    
    try {
      const searchResults = await searchAPI.instantSearch(searchQuery, 10);
      setResults(searchResults);
    } catch (error) {
      console.error('Instant search error:', error);
      setResults({
        query: searchQuery,
        results: [],
        error: 'Search failed. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  }, []);
  
  // Effect for debounced search
  useEffect(() => {
    if (debouncedQuery) {
      performSearch(debouncedQuery);
    } else {
      setResults(null);
      setShowResults(false);
    }
  }, [debouncedQuery, performSearch]);
  
  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setSelectedIndex(-1);
    
    // Show placeholder results for empty query
    if (!value.trim()) {
      setShowResults(true);
      setResults({
        query: '',
        results: [],
        suggestions: searchHistory.slice(0, 3),
        recent_docs: recentDocuments.slice(0, 3),
      });
    }
  };
  
  // Navigate to document
  const navigateToDocument = (doc: any) => {
    addSearchHistory(query || doc.name);
    addRecentDocument(doc);
    navigate(`/docs/${doc.name}/${doc.section || '1'}`);
    if (onClose) onClose();
  };
  
  // Handle selection
  const handleSelect = (item: any) => {
    if (item.type === 'document' || item.id) {
      navigateToDocument(item);
    } else if (item.type === 'search') {
      setQuery(item.value);
      performSearch(item.value);
    } else if (item.type === 'shortcut') {
      // Handle shortcut navigation
      const command = item.command || item.value.replace('!', '');
      performSearch(command);
    }
  };
  
  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const items = getAllSelectableItems();
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < items.length - 1 ? prev + 1 : 0
        );
        break;
        
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev > 0 ? prev - 1 : items.length - 1
        );
        break;
        
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < items.length) {
          handleSelect(items[selectedIndex]);
        } else if (query.trim()) {
          // Perform search with current query
          addSearchHistory(query);
          if (results?.results?.[0]) {
            navigateToDocument(results.results[0]);
          }
        }
        break;
        
      case 'Escape':
        e.preventDefault();
        if (query) {
          setQuery('');
        } else if (onClose) {
          onClose();
        }
        break;
    }
  };
  
  // Get all selectable items for keyboard navigation
  const getAllSelectableItems = () => {
    const items = [];
    
    // Add shortcuts
    if (results?.shortcuts) {
      items.push(...results.shortcuts.map((s: any) => ({ ...s, type: 'shortcut' })));
    }
    
    // Add natural language results
    if (results?.natural_language?.length) {
      items.push(...results.natural_language.map((cmd: string) => ({
        value: cmd,
        type: 'search',
        display: `Search for "${cmd}"`,
      })));
    }
    
    // Add search results
    if (results?.results) {
      items.push(...results.results.map((r: any) => ({ ...r, type: 'document' })));
    }
    
    // Add suggestions
    if (results?.suggestions) {
      items.push(...results.suggestions.map((s: string) => ({
        value: s,
        type: 'search',
        display: s,
      })));
    }
    
    // Add recent docs if no query
    if (!query && results?.recent_docs) {
      items.push(...results.recent_docs.map((d: any) => ({ ...d, type: 'document' })));
    }
    
    return items;
  };
  
  const items = getAllSelectableItems();
  
  return (
    <div className={cn('relative w-full max-w-3xl mx-auto', className)}>
      {/* Search Input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          {loading ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            >
              <MagnifyingGlassIcon className="w-5 h-5 text-gray-400" />
            </motion.div>
          ) : (
            <MagnifyingGlassIcon className="w-5 h-5 text-gray-400" />
          )}
        </div>
        
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={cn(
            'w-full pl-12 pr-12 py-4 text-lg',
            'bg-white dark:bg-gray-800',
            'border-2 border-gray-200 dark:border-gray-700',
            'rounded-2xl shadow-lg',
            'focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500',
            'transition-all duration-200',
            'placeholder-gray-400 dark:placeholder-gray-500'
          )}
        />
        
        <div className="absolute inset-y-0 right-0 pr-4 flex items-center space-x-2">
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <Cross2Icon className="w-5 h-5" />
            </button>
          )}
          
          <div className="text-xs text-gray-400 dark:text-gray-500 hidden sm:block">
            <KeyboardIcon className="w-4 h-4 inline mr-1" />
            <span>⌘K</span>
          </div>
        </div>
      </div>
      
      {/* Results Dropdown */}
      <AnimatePresence>
        {showResults && (results || !query) && (
          <motion.div
            ref={resultsRef}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className={cn(
              'absolute top-full left-0 right-0 mt-2',
              'bg-white dark:bg-gray-800',
              'border-2 border-gray-200 dark:border-gray-700',
              'rounded-2xl shadow-2xl',
              'max-h-[70vh] overflow-y-auto',
              'z-50'
            )}
          >
            {/* Error State */}
            {results?.error && (
              <div className="p-4 text-center">
                <ExclamationTriangleIcon className="w-8 h-8 text-red-500 mx-auto mb-2" />
                <p className="text-sm text-gray-600 dark:text-gray-400">{results.error}</p>
              </div>
            )}
            
            {/* Did You Mean */}
            {results?.did_you_mean && (
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => {
                    setQuery(results.did_you_mean);
                    performSearch(results.did_you_mean);
                  }}
                  className="flex items-center space-x-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <QuestionMarkCircledIcon className="w-4 h-4" />
                  <span>Did you mean "{results.did_you_mean}"?</span>
                </button>
              </div>
            )}
            
            {/* Shortcuts */}
            {results?.shortcuts?.length > 0 && (
              <div className="p-2">
                <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Quick Navigation
                </div>
                {results.shortcuts.map((shortcut: any, index: number) => (
                  <QuickNavItem
                    key={index}
                    item={shortcut}
                    selected={selectedIndex === index}
                    onClick={() => handleSelect(shortcut)}
                  />
                ))}
              </div>
            )}
            
            {/* Natural Language Results */}
            {results?.natural_language?.length > 0 && (
              <div className="p-2 border-t border-gray-200 dark:border-gray-700">
                <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Related Commands
                </div>
                {results.natural_language.map((cmd: string, index: number) => {
                  const itemIndex = (results.shortcuts?.length || 0) + index;
                  return (
                    <NaturalLanguageItem
                      key={index}
                      command={cmd}
                      selected={selectedIndex === itemIndex}
                      onClick={() => handleSelect({ value: cmd, type: 'search' })}
                    />
                  );
                })}
              </div>
            )}
            
            {/* Search Results */}
            {results?.results?.length > 0 && (
              <div className="p-2 border-t border-gray-200 dark:border-gray-700">
                <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Commands
                </div>
                {results.results.map((result: any, index: number) => {
                  const itemIndex = (results.shortcuts?.length || 0) + 
                                   (results.natural_language?.length || 0) + index;
                  return (
                    <SearchResultItem
                      key={result.id || index}
                      result={result}
                      selected={selectedIndex === itemIndex}
                      onClick={() => handleSelect(result)}
                      isFavorite={favorites.some((f: any) => f.id === result.id)}
                    />
                  );
                })}
              </div>
            )}
            
            {/* Suggestions */}
            {results?.suggestions?.length > 0 && !results?.results?.length && (
              <div className="p-2">
                <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Suggestions
                </div>
                {results.suggestions.map((suggestion: string, index: number) => {
                  const itemIndex = (results.shortcuts?.length || 0) + 
                                   (results.natural_language?.length || 0) + 
                                   (results.results?.length || 0) + index;
                  return (
                    <SuggestionItem
                      key={index}
                      suggestion={suggestion}
                      selected={selectedIndex === itemIndex}
                      onClick={() => handleSelect({ value: suggestion, type: 'search' })}
                    />
                  );
                })}
              </div>
            )}
            
            {/* Recent Documents (when no query) */}
            {!query && recentDocuments.length > 0 && (
              <div className="p-2 border-t border-gray-200 dark:border-gray-700">
                <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Recent
                </div>
                {recentDocuments.slice(0, 3).map((doc, index) => {
                  const itemIndex = items.length - recentDocuments.length + index;
                  return (
                    <RecentDocItem
                      key={doc.id}
                      doc={doc}
                      selected={selectedIndex === itemIndex}
                      onClick={() => handleSelect(doc)}
                      isFavorite={favorites.some((f: any) => f.id === doc.id)}
                    />
                  );
                })}
              </div>
            )}
            
            {/* Categories */}
            {results?.categories?.length > 0 && (
              <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400">
                  <span>Related categories:</span>
                  {results.categories.map((cat: string) => (
                    <span
                      key={cat}
                      className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded-md"
                    >
                      {cat}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            {/* Empty State */}
            {query && !loading && !results?.results?.length && !results?.suggestions?.length && (
              <div className="p-8 text-center">
                <p className="text-gray-500 dark:text-gray-400">
                  No results found for "{query}"
                </p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                  Try a different search term or check your spelling
                </p>
              </div>
            )}
            
            {/* Footer */}
            <div className="px-4 py-2 text-xs text-gray-400 dark:text-gray-500 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <span>↑↓ Navigate</span>
                <span>↵ Select</span>
                <span>ESC Close</span>
              </div>
              {results?.instant && (
                <div className="flex items-center space-x-1">
                  <LightningBoltIcon className="w-3 h-3" />
                  <span>Instant Search</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Component for quick navigation items
const QuickNavItem: React.FC<{
  item: any;
  selected: boolean;
  onClick: () => void;
}> = ({ item, selected, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      'w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors',
      'hover:bg-gray-100 dark:hover:bg-gray-700',
      selected && 'bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-500'
    )}
  >
    <RocketIcon className="w-4 h-4 text-blue-500" />
    <div className="flex-1">
      <div className="font-medium font-mono text-sm">{item.command}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400">
        Direct navigation to {item.document?.title || item.command}
      </div>
    </div>
    <ArrowRightIcon className="w-4 h-4 text-gray-400" />
  </button>
);

// Component for natural language items
const NaturalLanguageItem: React.FC<{
  command: string;
  selected: boolean;
  onClick: () => void;
}> = ({ command, selected, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      'w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors',
      'hover:bg-gray-100 dark:hover:bg-gray-700',
      selected && 'bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-500'
    )}
  >
    <LightningBoltIcon className="w-4 h-4 text-purple-500" />
    <span className="font-mono text-sm">{command}</span>
  </button>
);

// Component for search result items
const SearchResultItem: React.FC<{
  result: any;
  selected: boolean;
  onClick: () => void;
  isFavorite: boolean;
}> = ({ result, selected, onClick, isFavorite }) => (
  <button
    onClick={onClick}
    className={cn(
      'w-full flex items-start space-x-3 px-3 py-2 rounded-lg text-left transition-colors',
      'hover:bg-gray-100 dark:hover:bg-gray-700',
      selected && 'bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-500'
    )}
  >
    <CodeIcon className="w-4 h-4 text-gray-400 dark:text-gray-500 mt-0.5" />
    <div className="flex-1 min-w-0">
      <div className="flex items-center space-x-2">
        <span className="font-medium font-mono text-sm">{result.name}</span>
        {isFavorite && <BookmarkIcon className="w-3 h-3 text-blue-500" />}
        {result.match_type === 'fuzzy' && (
          <span className="text-xs px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded">
            fuzzy
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
        {result.summary || result.title}
      </p>
    </div>
    {result.score && (
      <div className="text-xs text-gray-400 dark:text-gray-500">
        {Math.round(result.score * 10) / 10}
      </div>
    )}
  </button>
);

// Component for suggestion items
const SuggestionItem: React.FC<{
  suggestion: string;
  selected: boolean;
  onClick: () => void;
}> = ({ suggestion, selected, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      'w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors',
      'hover:bg-gray-100 dark:hover:bg-gray-700',
      selected && 'bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-500'
    )}
  >
    <MagnifyingGlassIcon className="w-4 h-4 text-gray-400" />
    <span className="font-mono text-sm">{suggestion}</span>
  </button>
);

// Component for recent document items
const RecentDocItem: React.FC<{
  doc: Document;
  selected: boolean;
  onClick: () => void;
  isFavorite: boolean;
}> = ({ doc, selected, onClick, isFavorite }) => (
  <button
    onClick={onClick}
    className={cn(
      'w-full flex items-start space-x-3 px-3 py-2 rounded-lg text-left transition-colors',
      'hover:bg-gray-100 dark:hover:bg-gray-700',
      selected && 'bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-500'
    )}
  >
    <ClockIcon className="w-4 h-4 text-gray-400 dark:text-gray-500 mt-0.5" />
    <div className="flex-1 min-w-0">
      <div className="flex items-center space-x-2">
        <span className="font-medium font-mono text-sm">{doc.title}</span>
        {isFavorite && <BookmarkIcon className="w-3 h-3 text-blue-500" />}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
        {doc.summary}
      </p>
    </div>
  </button>
);