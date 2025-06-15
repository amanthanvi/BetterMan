"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  MagnifyingGlassIcon,
  Cross2Icon,
  FileTextIcon,
  ClockIcon,
  BookmarkIcon,
  ChevronRightIcon,
  LightningBoltIcon,
  KeyboardIcon,
} from '@radix-ui/react-icons';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/stores/appStore';
import { useDebounce } from '@/utils/useDebounce';
import type { SearchResult } from '@/types';

interface PremiumSearchProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
}

export const PremiumSearch: React.FC<PremiumSearchProps> = ({
  isOpen,
  onClose,
  className,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  
  const searchRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  
  const { recentSearches, addRecentSearch, favorites } = useAppStore();
  const debouncedQuery = useDebounce(query, 300);

  // Auto-focus search input when opened
  useEffect(() => {
    if (isOpen && searchRef.current) {
      searchRef.current.focus();
    }
  }, [isOpen]);

  // Search when query changes
  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setResults([]);
      return;
    }

    const performSearch = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          q: debouncedQuery,
          ...(selectedSection && { section: selectedSection }),
        });
        
        const response = await fetch(`/api/search?${params}`);
        const data = await response.json();
        setResults(data.results || []);
      } catch (error) {
        console.error('Search error:', error);
        setResults([]);
      } finally {
        setLoading(false);
      }
    };

    performSearch();
  }, [debouncedQuery, selectedSection]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < results.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev > 0 ? prev - 1 : results.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (results[selectedIndex]) {
          handleSelectResult(results[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }, [isOpen, results, selectedIndex, onClose]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleSelectResult = (result: SearchResult) => {
    addRecentSearch(result.title);
    navigate(`/docs/${result.id}`);
    onClose();
  };

  const sections = [
    { value: '1', label: 'User Commands', icon: '👤' },
    { value: '2', label: 'System Calls', icon: '⚙️' },
    { value: '3', label: 'Library Functions', icon: '📚' },
    { value: '4', label: 'Device Files', icon: '💾' },
    { value: '5', label: 'File Formats', icon: '📄' },
    { value: '6', label: 'Games', icon: '🎮' },
    { value: '7', label: 'Miscellaneous', icon: '📦' },
    { value: '8', label: 'System Admin', icon: '🛠️' },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Search modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "fixed top-[10%] left-1/2 -translate-x-1/2 z-50",
              "w-full max-w-3xl max-h-[80vh]",
              "bg-white dark:bg-gray-900",
              "rounded-2xl shadow-2xl",
              "overflow-hidden",
              className
            )}
          >
            {/* Search header */}
            <div className="relative border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center px-6 py-4">
                <MagnifyingGlassIcon className="w-6 h-6 text-gray-400 mr-3" />
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search documentation..."
                  className={cn(
                    "flex-1 bg-transparent outline-none",
                    "text-lg text-gray-900 dark:text-gray-100",
                    "placeholder-gray-500 dark:placeholder-gray-400"
                  )}
                />
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                  >
                    <Cross2Icon className="w-5 h-5 text-gray-500" />
                  </button>
                )}
              </div>

              {/* Filters */}
              <div className="px-6 pb-3 flex items-center gap-2">
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={cn(
                    "px-3 py-1.5 text-sm rounded-lg transition-colors",
                    "flex items-center gap-2",
                    showFilters
                      ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400",
                    "hover:bg-gray-200 dark:hover:bg-gray-700"
                  )}
                >
                  <LightningBoltIcon className="w-3 h-3" />
                  Filters
                </button>
                
                <AnimatePresence>
                  {showFilters && (
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      className="flex items-center gap-1"
                    >
                      {sections.map((section) => (
                        <button
                          key={section.value}
                          onClick={() => setSelectedSection(
                            selectedSection === section.value ? null : section.value
                          )}
                          className={cn(
                            "px-3 py-1.5 text-sm rounded-lg transition-all",
                            "flex items-center gap-1.5",
                            selectedSection === section.value
                              ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                              : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400",
                            "hover:bg-gray-200 dark:hover:bg-gray-700"
                          )}
                        >
                          <span>{section.icon}</span>
                          <span className="hidden sm:inline">{section.label}</span>
                          <span className="sm:hidden">{section.value}</span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Search results */}
            <div 
              ref={resultsRef}
              className="overflow-y-auto"
              style={{ maxHeight: 'calc(80vh - 140px)' }}
            >
              {loading && (
                <div className="flex items-center justify-center py-12">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full"
                  />
                </div>
              )}

              {!loading && query.length < 2 && (
                <div className="p-6">
                  {/* Recent searches */}
                  {recentSearches.length > 0 && (
                    <div className="mb-6">
                      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-2">
                        <ClockIcon className="w-4 h-4" />
                        Recent Searches
                      </h3>
                      <div className="space-y-1">
                        {recentSearches.slice(0, 5).map((search, index) => (
                          <button
                            key={index}
                            onClick={() => setQuery(search)}
                            className={cn(
                              "w-full text-left px-4 py-2 rounded-lg",
                              "text-gray-700 dark:text-gray-300",
                              "hover:bg-gray-100 dark:hover:bg-gray-800",
                              "transition-colors"
                            )}
                          >
                            {search}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Quick actions */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-2">
                      <LightningBoltIcon className="w-4 h-4" />
                      Quick Actions
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => navigate('/favorites')}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg",
                          "bg-gray-100 dark:bg-gray-800",
                          "hover:bg-gray-200 dark:hover:bg-gray-700",
                          "transition-colors"
                        )}
                      >
                        <BookmarkIcon className="w-5 h-5 text-blue-500" />
                        <span className="text-gray-700 dark:text-gray-300">
                          View Favorites
                        </span>
                      </button>
                      <button
                        onClick={() => navigate('/docs')}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg",
                          "bg-gray-100 dark:bg-gray-800",
                          "hover:bg-gray-200 dark:hover:bg-gray-700",
                          "transition-colors"
                        )}
                      >
                        <FileTextIcon className="w-5 h-5 text-green-500" />
                        <span className="text-gray-700 dark:text-gray-300">
                          Browse All
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {!loading && results.length > 0 && (
                <div className="py-2">
                  {results.map((result, index) => (
                    <motion.button
                      key={result.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.02 }}
                      onClick={() => handleSelectResult(result)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={cn(
                        "w-full px-6 py-3 text-left",
                        "flex items-center justify-between",
                        "transition-colors",
                        selectedIndex === index
                          ? "bg-blue-50 dark:bg-blue-900/20"
                          : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      )}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <FileTextIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {result.title}
                            </span>
                            {result.section && (
                              <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">
                                Section {result.section}
                              </span>
                            )}
                          </div>
                          {result.summary && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                              {result.summary}
                            </p>
                          )}
                        </div>
                      </div>
                      {selectedIndex === index && (
                        <ChevronRightIcon className="w-5 h-5 text-gray-400" />
                      )}
                    </motion.button>
                  ))}
                </div>
              )}

              {!loading && query.length >= 2 && results.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-gray-500 dark:text-gray-400">
                    No results found for "{query}"
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-200 dark:border-gray-800 px-6 py-3">
              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <KeyboardIcon className="w-3 h-3" />
                    <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">↑↓</kbd>
                    Navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">Enter</kbd>
                    Select
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">Esc</kbd>
                    Close
                  </span>
                </div>
                {results.length > 0 && (
                  <span>{results.length} results</span>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};