'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Command, Sparkles } from 'lucide-react';
import { searchClient } from '@/lib/search/client';
import { cn } from '@/lib/utils/cn';
import { useDebounce } from '@/hooks/use-debounce';

export function SearchHero() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebounce(query, 200);

  useEffect(() => {
    if (debouncedQuery.length >= 2) {
      searchClient.getSuggestions(debouncedQuery, 8).then(setSuggestions);
      setIsOpen(true);
    } else {
      setSuggestions([]);
      setIsOpen(false);
    }
  }, [debouncedQuery]);

  const handleSearch = useCallback((searchQuery: string) => {
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setIsOpen(false);
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

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
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
          <Sparkles className="relative h-8 w-8 text-primary/50 animate-glow-pulse" />
        </div>
      </div>

      <div className="relative">
        <div
          className={cn(
            "relative transition-all duration-300",
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
                suggestions.length > 0 && setIsOpen(true);
              }}
              onBlur={() => {
                setIsFocused(false);
                setTimeout(() => setIsOpen(false), 200);
              }}
              placeholder="Search for any Linux command..."
              className={cn(
                "h-14 w-full rounded-full pl-14 pr-24",
                "bg-card border border-border/50",
                "text-lg placeholder:text-muted-foreground/70",
                "shadow-sm transition-all duration-200",
                "focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent",
                "focus:shadow-lg focus:shadow-primary/5",
                isFocused && "bg-card/90 backdrop-blur-sm"
              )}
            />
            
            <div className="absolute right-5 flex items-center gap-2">
              <kbd className="hidden sm:inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
                <Command className="h-3 w-3" />K
              </kbd>
            </div>
          </div>
        </div>

        {/* Suggestions Dropdown */}
        {isOpen && suggestions.length > 0 && (
          <div className="absolute top-full z-50 mt-3 w-full animate-slide-up">
            <div className="overflow-hidden rounded-lg border border-border/50 bg-card/95 backdrop-blur-xl shadow-2xl">
              <ul className="py-2">
                {suggestions.map((suggestion, index) => (
                  <li key={suggestion}>
                    <button
                      className={cn(
                        "flex w-full items-center gap-3 px-5 py-3 text-left transition-all duration-150",
                        selectedIndex === index
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-muted/50 text-foreground"
                      )}
                      onClick={() => handleSearch(suggestion)}
                    >
                      <Search className="h-4 w-4 text-muted-foreground" />
                      <span className="font-mono text-sm font-medium">{suggestion}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="border-t border-border/50 px-5 py-2">
                <p className="text-xs text-muted-foreground">
                  Press <kbd className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">Enter</kbd> to search
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Example searches */}
      <div className="mt-6 flex flex-wrap justify-center gap-2 text-sm">
        <span className="text-muted-foreground">Popular:</span>
        {['grep', 'find', 'awk', 'sed', 'chmod'].map((cmd) => (
          <button
            key={cmd}
            onClick={() => {
              setQuery(cmd);
              handleSearch(cmd);
            }}
            className="text-primary/80 hover:text-primary font-mono hover:underline transition-colors"
          >
            {cmd}
          </button>
        ))}
      </div>
    </div>
  );
}