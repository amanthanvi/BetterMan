'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Command,
  Search,
  FileText,
  Home,
  Settings,
  Star,
  Clock,
  ArrowRight,
  Sparkles,
  Code2,
  Terminal,
  Bookmark,
  Hash,
  Filter,
  Copy,
  ExternalLink,
  ChevronRight,
} from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useDebounce } from '@/hooks/use-debounce'
import { EnhancedSearch } from '@/lib/search/enhanced-search'
import type { SearchResult } from '@/lib/search/enhanced-search'

interface CommandItem {
  id: string
  label: string
  description?: string
  icon?: any
  shortcut?: string[]
  action: () => void | Promise<void>
  keywords?: string[]
  category?: string
}

interface CommandGroup {
  heading: string
  items: CommandItem[]
}

export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [recentCommands, setRecentCommands] = useState<string[]>([])
  const [favorites, setFavorites] = useState<string[]>([])
  
  const debouncedSearch = useDebounce(search, 200)

  // Load user data
  useEffect(() => {
    const loadUserData = () => {
      const recent = JSON.parse(localStorage.getItem('recent-commands') || '[]')
      const favs = JSON.parse(localStorage.getItem('favorite-commands') || '[]')
      setRecentCommands(recent)
      setFavorites(favs)
    }
    
    loadUserData()
    window.addEventListener('storage', loadUserData)
    return () => window.removeEventListener('storage', loadUserData)
  }, [])

  // Command groups
  const navigationCommands: CommandItem[] = [
    {
      id: 'home',
      label: 'Go to Home',
      icon: Home,
      shortcut: ['G', 'H'],
      action: () => {
        router.push('/')
        setOpen(false)
      },
      keywords: ['home', 'index', 'main'],
      category: 'Navigation',
    },
    {
      id: 'search',
      label: 'Search Documentation',
      icon: Search,
      shortcut: ['G', 'S'],
      action: () => {
        router.push('/search')
        setOpen(false)
      },
      keywords: ['find', 'lookup', 'query'],
      category: 'Navigation',
    },
    {
      id: 'browse',
      label: 'Browse All Commands',
      icon: FileText,
      shortcut: ['G', 'B'],
      action: () => {
        router.push('/browse')
        setOpen(false)
      },
      keywords: ['all', 'list', 'commands'],
      category: 'Navigation',
    },
  ]

  const actionCommands: CommandItem[] = [
    {
      id: 'copy-link',
      label: 'Copy Current Page Link',
      icon: Copy,
      shortcut: ['⌘', 'L'],
      action: async () => {
        await navigator.clipboard.writeText(window.location.href)
        setOpen(false)
        // TODO: Show toast notification
      },
      keywords: ['share', 'url', 'link'],
      category: 'Actions',
    },
    {
      id: 'open-terminal',
      label: 'Open in Terminal',
      icon: Terminal,
      description: 'Open current command in system terminal',
      action: () => {
        const match = window.location.pathname.match(/\/docs\/(.+)/)
        if (match) {
          window.open(`man://${match[1]}`, '_blank')
        }
        setOpen(false)
      },
      keywords: ['terminal', 'console', 'cli'],
      category: 'Actions',
    },
    {
      id: 'playground',
      label: 'Open Playground',
      icon: Code2,
      shortcut: ['⌘', 'P'],
      action: () => {
        router.push('/playground')
        setOpen(false)
      },
      keywords: ['try', 'test', 'experiment'],
      category: 'Actions',
    },
  ]

  const preferenceCommands: CommandItem[] = [
    {
      id: 'theme',
      label: 'Toggle Theme',
      icon: Sparkles,
      shortcut: ['⌘', 'T'],
      action: () => {
        // TODO: Implement theme toggle
        setOpen(false)
      },
      keywords: ['dark', 'light', 'mode'],
      category: 'Preferences',
    },
    {
      id: 'settings',
      label: 'Open Settings',
      icon: Settings,
      shortcut: ['⌘', ','],
      action: () => {
        router.push('/settings')
        setOpen(false)
      },
      keywords: ['preferences', 'config', 'options'],
      category: 'Preferences',
    },
  ]

  // Build filtered command groups based on search
  const getFilteredCommands = useCallback((): CommandGroup[] => {
    if (!search) {
      // Show default groups when no search
      const groups: CommandGroup[] = []
      
      // Recent commands
      if (recentCommands.length > 0) {
        groups.push({
          heading: 'Recent',
          items: recentCommands.slice(0, 3).map(cmd => ({
            id: `recent-${cmd}`,
            label: `Open ${cmd}`,
            icon: Clock,
            action: () => {
              router.push(`/docs/${cmd}`)
              setOpen(false)
            },
          })),
        })
      }
      
      // Favorites
      if (favorites.length > 0) {
        groups.push({
          heading: 'Favorites',
          items: favorites.slice(0, 3).map(cmd => ({
            id: `favorite-${cmd}`,
            label: cmd,
            icon: Star,
            action: () => {
              router.push(`/docs/${cmd}`)
              setOpen(false)
            },
          })),
        })
      }
      
      // Default commands
      groups.push(
        { heading: 'Navigation', items: navigationCommands },
        { heading: 'Actions', items: actionCommands },
        { heading: 'Preferences', items: preferenceCommands }
      )
      
      return groups
    }
    
    // Filter commands based on search
    const allCommands = [...navigationCommands, ...actionCommands, ...preferenceCommands]
    const searchLower = search.toLowerCase()
    
    const filtered = allCommands.filter(cmd => 
      cmd.label.toLowerCase().includes(searchLower) ||
      cmd.description?.toLowerCase().includes(searchLower) ||
      cmd.keywords?.some(k => k.toLowerCase().includes(searchLower))
    )
    
    if (filtered.length > 0) {
      return [{ heading: 'Commands', items: filtered }]
    }
    
    return []
  }, [search, recentCommands, favorites, navigationCommands, actionCommands, preferenceCommands, router])

  // Perform documentation search with Fuse.js
  useEffect(() => {
    const performSearch = async () => {
      if (debouncedSearch.length >= 1) { // Start searching from 1 character
        setIsSearching(true)
        
        try {
          // Use the improved search API with fuzzy search
          const response = await fetch(`/api/search?q=${encodeURIComponent(debouncedSearch)}&limit=8&fuzzy=true`)
          const data = await response.json()
          setSearchResults(data.results || [])
        } catch (error) {
          console.error('Search error:', error)
          setSearchResults([])
        } finally {
          setIsSearching(false)
        }
      } else {
        setSearchResults([])
      }
    }

    performSearch()
  }, [debouncedSearch])

  // Calculate all items for keyboard navigation
  const allItems = getFilteredCommands().flatMap(group => group.items)
  const totalItems = allItems.length + searchResults.length

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Open command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(prev => !prev)
        return
      }
      
      if (!open) return
      
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex(prev => (prev + 1) % totalItems)
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex(prev => (prev - 1 + totalItems) % totalItems)
          break
        case 'Enter':
          e.preventDefault()
          if (selectedIndex < allItems.length) {
            allItems[selectedIndex].action()
          } else {
            const searchResult = searchResults[selectedIndex - allItems.length]
            if (searchResult) {
              router.push(`/docs/${searchResult.name}.${searchResult.section}`)
              setOpen(false)
              
              // Add to recent
              const newRecent = [searchResult.name, ...recentCommands.filter(c => c !== searchResult.name)].slice(0, 10)
              setRecentCommands(newRecent)
              localStorage.setItem('recent-commands', JSON.stringify(newRecent))
            }
          }
          break
        case 'Escape':
          e.preventDefault()
          setOpen(false)
          break
      }
    }
    
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, selectedIndex, totalItems, allItems, searchResults, router, recentCommands])

  // Reset state when closing
  useEffect(() => {
    if (!open) {
      setSearch('')
      setSelectedIndex(0)
      setSearchResults([])
    }
  }, [open])

  const commandGroups = getFilteredCommands()

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <DialogTitle className="sr-only">Command Palette</DialogTitle>
        
        {/* Search Input */}
        <div className="flex items-center border-b px-3">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setSelectedIndex(0)
            }}
            placeholder="Type a command or search..."
            className="flex-1 px-3 py-4 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
            autoFocus
          />
          {isSearching && (
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" />
          )}
        </div>
        
        {/* Results */}
        <div className="max-h-[400px] overflow-y-auto">
          {/* Command Groups */}
          {commandGroups.map((group, groupIndex) => (
            <div key={group.heading}>
              <div className="px-3 py-2 text-xs font-medium text-muted-foreground">
                {group.heading}
              </div>
              {group.items.map((item, itemIndex) => {
                const globalIndex = commandGroups
                  .slice(0, groupIndex)
                  .reduce((acc, g) => acc + g.items.length, 0) + itemIndex
                const isSelected = selectedIndex === globalIndex
                const Icon = item.icon
                
                return (
                  <button
                    key={item.id}
                    onClick={item.action}
                    className={cn(
                      'w-full px-3 py-2 flex items-center justify-between text-left',
                      'hover:bg-muted/50 transition-colors',
                      isSelected && 'bg-muted/50'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
                      <div>
                        <div className="text-sm font-medium">{item.label}</div>
                        {item.description && (
                          <div className="text-xs text-muted-foreground">{item.description}</div>
                        )}
                      </div>
                    </div>
                    
                    {item.shortcut && (
                      <div className="flex items-center gap-1">
                        {item.shortcut.map((key, i) => (
                          <kbd
                            key={i}
                            className="px-1.5 py-0.5 text-xs bg-muted rounded border border-border"
                          >
                            {key}
                          </kbd>
                        ))}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
          
          {/* Search Results */}
          {searchResults.length > 0 && (
            <div>
              <div className="px-3 py-2 text-xs font-medium text-muted-foreground">
                Documentation
              </div>
              {searchResults.map((result, index) => {
                const globalIndex = allItems.length + index
                const isSelected = selectedIndex === globalIndex
                
                return (
                  <button
                    key={result.id}
                    onClick={() => {
                      router.push(`/docs/${result.name}.${result.section}`)
                      setOpen(false)
                    }}
                    className={cn(
                      'w-full px-3 py-2 flex items-center justify-between text-left',
                      'hover:bg-muted/50 transition-colors',
                      isSelected && 'bg-muted/50'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono font-medium">{result.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {result.category}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {result.description}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </button>
                )
              })}
            </div>
          )}
          
          {/* Empty State */}
          {search && commandGroups.length === 0 && searchResults.length === 0 && !isSearching && (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              No results found for "{search}"
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="border-t px-3 py-2 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-muted rounded text-xs border border-border">↑↓</kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-muted rounded text-xs border border-border">↵</kbd>
              Select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-muted rounded text-xs border border-border">esc</kbd>
              Close
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Hash className="w-3 h-3" />
            <span>for commands</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}