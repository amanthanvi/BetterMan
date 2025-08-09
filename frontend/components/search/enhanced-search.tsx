'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, Loader2, Command, FileText, Zap, Clock, TrendingUp, Filter } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useDebounce } from '@/hooks/use-debounce'
import type { SearchResult } from '@/lib/search/enhanced-search'

interface EnhancedSearchProps {
  className?: string
  placeholder?: string
  autoFocus?: boolean
  onSelect?: (result: SearchResult) => void
}

interface SearchFilters {
  section?: number
  category?: string
  complexity?: 'basic' | 'intermediate' | 'advanced'
}

export function EnhancedSearch({
  className,
  placeholder = 'Search commands...',
  autoFocus = false,
  onSelect,
}: EnhancedSearchProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [searchTime, setSearchTime] = useState<number | null>(null)
  const [filters, setFilters] = useState<SearchFilters>({})
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const debouncedQuery = useDebounce(query, 150)

  // Load recent searches from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('recent-searches')
    if (stored) {
      setRecentSearches(JSON.parse(stored))
    }
  }, [])

  // Perform search
  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setResults([])
      setSuggestions([])
      return
    }

    const searchParams = new URLSearchParams({
      q: debouncedQuery,
      ...(filters.section && { section: filters.section.toString() }),
      ...(filters.category && { category: filters.category }),
      ...(filters.complexity && { complexity: filters.complexity }),
      matches: 'true',
    })

    setIsLoading(true)
    
    Promise.all([
      // Search request
      fetch(`/api/search/enhanced?${searchParams}`).then(r => r.json()),
      // Suggestions request
      fetch('/api/search/enhanced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: debouncedQuery }),
      }).then(r => r.json()),
    ])
      .then(([searchData, suggestionData]) => {
        setResults(searchData.results || [])
        setSuggestions(suggestionData.suggestions || [])
        setSearchTime(searchData.searchTime || null)
        setIsOpen(true)
        setSelectedIndex(0)
      })
      .catch(error => {
        console.error('Search error:', error)
        setResults([])
        setSuggestions([])
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [debouncedQuery, filters])

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev => 
          prev < results.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => prev > 0 ? prev - 1 : 0)
        break
      case 'Enter':
        e.preventDefault()
        if (results[selectedIndex]) {
          handleSelect(results[selectedIndex])
        }
        break
      case 'Escape':
        e.preventDefault()
        setIsOpen(false)
        inputRef.current?.blur()
        break
    }
  }, [isOpen, results, selectedIndex])

  const handleSelect = (result: SearchResult) => {
    // Add to recent searches
    const newRecent = [result.name, ...recentSearches.filter(s => s !== result.name)].slice(0, 5)
    setRecentSearches(newRecent)
    localStorage.setItem('recent-searches', JSON.stringify(newRecent))
    
    // Navigate or callback
    if (onSelect) {
      onSelect(result)
    } else {
      router.push(`/docs/${result.name}.${result.section}`)
    }
    
    setIsOpen(false)
    setQuery('')
  }

  const highlightMatches = (text: string, matches?: any[]) => {
    if (!matches || matches.length === 0) return text
    
    // Sort matches by start index
    const sortedMatches = matches
      .flatMap(m => m.indices)
      .sort((a, b) => a[0] - b[0])
    
    let lastIndex = 0
    const parts: React.ReactNode[] = []
    
    sortedMatches.forEach(([start, end], i) => {
      if (start > lastIndex) {
        parts.push(text.slice(lastIndex, start))
      }
      parts.push(
        <mark key={i} className="bg-warning/30 text-warning-foreground font-medium">
          {text.slice(start, end + 1)}
        </mark>
      )
      lastIndex = end + 1
    })
    
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex))
    }
    
    return parts
  }

  const getStrategyIcon = (strategy?: string) => {
    switch (strategy) {
      case 'exact':
        return <Zap className="w-3 h-3" />
      case 'fuzzy':
        return <Search className="w-3 h-3" />
      case 'fulltext':
        return <FileText className="w-3 h-3" />
      default:
        return null
    }
  }

  const getComplexityColor = (complexity: string) => {
    switch (complexity) {
      case 'basic':
        return 'text-green-500 bg-green-500/10'
      case 'intermediate':
        return 'text-yellow-500 bg-yellow-500/10'
      case 'advanced':
        return 'text-red-500 bg-red-500/10'
      default:
        return 'text-muted-foreground bg-muted'
    }
  }

  return (
    <div className={cn('relative', className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => query.length >= 2 && setIsOpen(true)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={cn(
            'pl-10 pr-20 h-10',
            'focus:ring-2 focus:ring-primary/50',
            'transition-all duration-200'
          )}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {/* Filters */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className={cn(
                  'h-7 px-2',
                  (filters.section || filters.category || filters.complexity) && 'text-primary'
                )}
              >
                <Filter className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Filter Results</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setFilters({})}>
                Clear Filters
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs">Section</DropdownMenuLabel>
              {[1, 2, 3, 8].map(section => (
                <DropdownMenuItem
                  key={section}
                  onClick={() => setFilters(prev => ({ ...prev, section }))}
                >
                  Section {section}
                  {filters.section === section && ' ✓'}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs">Complexity</DropdownMenuLabel>
              {['basic', 'intermediate', 'advanced'].map(complexity => (
                <DropdownMenuItem
                  key={complexity}
                  onClick={() => setFilters(prev => ({ ...prev, complexity: complexity as any }))}
                >
                  {complexity.charAt(0).toUpperCase() + complexity.slice(1)}
                  {filters.complexity === complexity && ' ✓'}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          
          {/* Loading/Clear */}
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : query ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setQuery('')
                setIsOpen(false)
                inputRef.current?.focus()
              }}
              className="h-7 w-7 p-0"
            >
              <X className="w-4 h-4" />
            </Button>
          ) : null}
        </div>
      </div>

      {/* Search Results Dropdown */}
      <AnimatePresence>
        {isOpen && (query.length >= 2 || recentSearches.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className={cn(
              'absolute top-full left-0 right-0 mt-2 z-50',
              'bg-popover border border-border rounded-lg shadow-lg',
              'max-h-[400px] overflow-hidden'
            )}
            ref={resultsRef}
          >
            {/* Search stats */}
            {searchTime !== null && results.length > 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border/50">
                Found {results.length} results in {searchTime}ms
              </div>
            )}
            
            {/* Suggestions */}
            {suggestions.length > 0 && query.length < 4 && (
              <div className="px-3 py-2 border-b border-border/50">
                <div className="text-xs font-medium text-muted-foreground mb-1">Suggestions</div>
                <div className="flex flex-wrap gap-1">
                  {suggestions.slice(0, 5).map(suggestion => (
                    <Badge
                      key={suggestion}
                      variant="secondary"
                      className="cursor-pointer hover:bg-primary/20 text-xs"
                      onClick={() => setQuery(suggestion)}
                    >
                      {suggestion}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            
            {/* Results */}
            <div className="overflow-y-auto max-h-[300px]">
              {results.length > 0 ? (
                results.map((result, index) => (
                  <motion.button
                    key={result.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.02 }}
                    onClick={() => handleSelect(result)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={cn(
                      'w-full px-4 py-3 text-left transition-colors',
                      'hover:bg-muted/50',
                      selectedIndex === index && 'bg-muted/50'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono font-medium text-sm">
                            {highlightMatches(result.name, result.matches?.filter(m => m.key === 'name'))}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {result.category}
                          </Badge>
                          <Badge
                            className={cn('text-xs', getComplexityColor(result.complexity))}
                          >
                            {result.complexity}
                          </Badge>
                          {result.searchStrategy && (
                            <span className="text-muted-foreground">
                              {getStrategyIcon(result.searchStrategy)}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {highlightMatches(result.description, result.matches?.filter(m => m.key === 'description'))}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Command className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{result.section}</span>
                      </div>
                    </div>
                  </motion.button>
                ))
              ) : query.length >= 2 && !isLoading ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm text-muted-foreground mb-2">No results found for "{query}"</p>
                  <p className="text-xs text-muted-foreground">Try a different search term or check the filters</p>
                </div>
              ) : recentSearches.length > 0 && query.length === 0 ? (
                <div className="p-3">
                  <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-2">
                    <Clock className="w-3 h-3" />
                    Recent Searches
                  </div>
                  <div className="space-y-1">
                    {recentSearches.map(search => (
                      <button
                        key={search}
                        onClick={() => setQuery(search)}
                        className="w-full text-left px-2 py-1 rounded text-sm hover:bg-muted/50 transition-colors"
                      >
                        {search}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            
            {/* Keyboard shortcuts hint */}
            <div className="px-3 py-2 border-t border-border/50 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">↑↓</kbd> Navigate
              </span>
              <span className="inline-flex items-center gap-1 ml-3">
                <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">↵</kbd> Select
              </span>
              <span className="inline-flex items-center gap-1 ml-3">
                <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">esc</kbd> Close
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}