'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Command, Sparkles, Loader2 } from 'lucide-react';
import { instantSearchClient } from '@/lib/search/instant-search-client';
import { cn } from '@/lib/utils/cn';
import { useDebounce } from '@/hooks/use-debounce';

export function SearchHero() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isFocused, setIsFocused] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebounce(query, 100); // Fast debounce for instant feel

  // Fetch suggestions with instant search
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (debouncedQuery.length >= 1) { // Start suggesting from 1 character
        setIsLoadingSuggestions(true);
        try {
          const results = await instantSearchClient.getSuggestions(debouncedQuery, 10);
          setSuggestions(results);
          setIsOpen(results.length > 0);
        } catch (error) {
          console.error('Failed to fetch suggestions:', error);
          setSuggestions([]);
        } finally {
          setIsLoadingSuggestions(false);
        }
      } else {
        setSuggestions([]);
        setIsOpen(false);
        setIsLoadingSuggestions(false);
      }
    };

    fetchSuggestions();
    
    // Cleanup on unmount
    return () => {
      instantSearchClient.cancelPendingSearches();
    };
  }, [debouncedQuery]);

  const handleSearch = useCallback((searchQuery: string) => {
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setIsOpen(false);
      
      // Clear pending searches when navigating
      instantSearchClient.cancelPendingSearches();
    }
  }, [router]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
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
        handleSearch(suggestions[selectedIndex]);
      } else {
        handleSearch(query);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  }, [suggestions, selectedIndex, query, handleSearch]);

  // Global keyboard shortcut for focusing search
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K to focus search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      // "/" to focus search (common pattern)
      else if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = e.target as HTMLElement;
        // Don't trigger if user is typing in an input
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          inputRef.current?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  return (
    <div className="relative mx-auto max-w-3xl mb-8">
      {/* Decorative elements */}
      <div className="absolute -top-20 left-1/2 -translate-x-1/2 pointer-events-none">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 blur-3xl" />
          <Sparkles className="relative h-8 w-8 text-primary/50 animate-pulse" />
        </div>
      </div>

      <div className="relative">
        <div
          className={cn(
            "relative transition-all duration-200",
            isFocused && "scale-[1.02]"
          )}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-accent/10 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
          
          <div className="relative flex items-center">
            <Search className="absolute left-5 h-5 w-5 text-muted-foreground pointer-events-none" />
            
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(-1);
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                setIsFocused(true);
                if (suggestions.length > 0) setIsOpen(true);
              }}
              onBlur={() => {
                setIsFocused(false);
                // Delay closing to allow click on suggestions
                setTimeout(() => setIsOpen(false), 200);
              }}
              placeholder="Search for any Linux command... (Press / or ⌘K)"
              className={cn(
                "h-14 w-full rounded-full pl-14 pr-32",
                "bg-card border border-border/50",
                "text-lg placeholder:text-muted-foreground/70",
                "shadow-sm transition-all duration-200",
                "focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent",
                "focus:shadow-lg focus:shadow-primary/5",
                isFocused && "bg-card/90 backdrop-blur-sm"
              )}
              autoComplete="off"
              spellCheck="false"
            />
            
            <div className="absolute right-5 flex items-center gap-2">
              {isLoadingSuggestions && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
              <div className="hidden sm:flex items-center gap-1">
                <kbd className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
                  <Command className="h-3 w-3" />K
                </kbd>
                <span className="text-xs text-muted-foreground">or</span>
                <kbd className="inline-flex items-center rounded-md border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
                  /
                </kbd>
              </div>
            </div>
          </div>
        </div>

        {/* Suggestions Dropdown with Fuzzy Search Results */}
        {isOpen && suggestions.length > 0 && (
          <div className="absolute top-full z-50 mt-3 w-full animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="overflow-hidden rounded-lg border border-border/50 bg-card/95 backdrop-blur-xl shadow-2xl">
              <div className="max-h-80 overflow-y-auto">
                <ul className="py-2">
                  {suggestions.map((suggestion, index) => (
                    <li key={`${suggestion}-${index}`}>
                      <button
                        className={cn(
                          "flex w-full items-center gap-3 px-5 py-3 text-left transition-all duration-150",
                          "hover:bg-muted/50",
                          selectedIndex === index
                            ? "bg-primary/10 text-primary"
                            : "text-foreground"
                        )}
                        onClick={() => handleSearch(suggestion)}
                        onMouseEnter={() => setSelectedIndex(index)}
                      >
                        <Search className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        <span className="font-mono text-sm font-medium">{suggestion}</span>
                        {/* Show if it's a fuzzy match */}
                        {!suggestion.toLowerCase().startsWith(query.toLowerCase()) && (
                          <span className="ml-auto text-xs text-muted-foreground">fuzzy</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border-t border-border/50 px-5 py-2 bg-muted/30">
                <p className="text-xs text-muted-foreground">
                  <kbd className="mx-1 rounded bg-muted px-1 py-0.5 text-xs border border-border">↑↓</kbd>
                  Navigate
                  <kbd className="mx-1 rounded bg-muted px-1 py-0.5 text-xs border border-border">Enter</kbd>
                  Search
                  <kbd className="mx-1 rounded bg-muted px-1 py-0.5 text-xs border border-border">Esc</kbd>
                  Close
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Example searches */}
      <div className="mt-6 flex flex-wrap justify-center gap-2 text-sm">
        <span className="text-muted-foreground">Try:</span>
        {['grep', 'find', 'awk', 'sed', 'chmod', 'docker', 'git'].map((cmd) => (
          <button
            key={cmd}
            onClick={() => {
              setQuery(cmd);
              handleSearch(cmd);
            }}
            className="text-primary/80 hover:text-primary font-mono hover:underline transition-colors text-sm"
          >
            {cmd}
          </button>
        ))}
      </div>
    </div>
  );
}