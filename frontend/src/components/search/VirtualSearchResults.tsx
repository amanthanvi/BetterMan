import React, { useMemo, useCallback, useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FileTextIcon, BookmarkIcon, StarIcon } from "@radix-ui/react-icons";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAppStore } from "@/stores/appStore";
import { useVirtualScroll } from "@/hooks/useVirtualScroll";
import { cn } from "@/utils/cn";
import type { Document, SearchResult } from "@/types";

interface VirtualSearchResultsProps {
  results: Document[];
  loading?: boolean;
  query?: string;
  className?: string;
}

// Memoized result card component
const ResultCard = React.memo<{
  result: Document;
  query?: string;
  isFavorite: boolean;
  onFavoriteToggle: () => void;
  onClick: () => void;
  index: number;
}>(({ result, query, isFavorite, onFavoriteToggle, onClick, index }) => {
  const highlightQuery = useCallback((text: string, searchQuery?: string) => {
    if (!searchQuery || !text) return text;

    const regex = new RegExp(`(${searchQuery})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-yellow-200 dark:bg-yellow-800/50 px-0.5 rounded">
          {part}
        </mark>
      ) : (
        part
      )
    );
  }, []);

  const formatSection = useCallback((section: string) => {
    const sectionNum = parseInt(section);
    const sectionNames: Record<number, string> = {
      1: "User Commands",
      2: "System Calls",
      3: "Library Functions",
      4: "Special Files",
      5: "File Formats",
      6: "Games",
      7: "Miscellaneous",
      8: "Admin Commands",
    };
    return sectionNames[sectionNum] || `Section ${section}`;
  }, []);

  return (
    <div
    >
      <Card className={cn(
          "group cursor-pointer hover:shadow-md transition-all duration-200",
          "transform hover:-translate-y-0.5",
          "border-gray-200 dark:border-gray-700"
        )}
        onClick={onClick}
      >
        <div className="p-4">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center space-x-2">
              <FileTextIcon className="w-5 h-5 text-gray-400 group-hover:text-blue-500 transition-colors" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {highlightQuery(result.name || result.title, query)}
                {result.section && (
                  <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-1">
                    ({result.section})
                  </span>
                )}
              </h3>
            </div>
            <div className="flex items-center space-x-2">
              {result.score && (
                <div className="flex items-center space-x-1">
                  <StarIcon className="w-4 h-4 text-yellow-500" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {(result.score * 100).toFixed(0)}%
                  </span>
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onFavoriteToggle();
                }}
                className={cn(
                  "opacity-0 group-hover:opacity-100 transition-opacity",
                  isFavorite && "opacity-100 text-blue-600 dark:text-blue-400"
                )}
              >
                <BookmarkIcon className={cn("w-4 h-4", isFavorite && "fill-current")} />
              </Button>
            </div>
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
            {highlightQuery(result.summary, query)}
          </p>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {result.section && (
                <Badge variant="secondary" className="text-xs">
                  {formatSection(String(result.section))}
                </Badge>
              )}
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {result.doc_set}
            </span>
          </div>

          {result.matches && result.matches.length > 0 && (
            <div className="mt-3 p-2 bg-gray-50 dark:bg-gray-800/50 rounded text-xs font-mono overflow-hidden">
              <div className="line-clamp-2">
                {highlightQuery(result.matches[0], query)}
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
});

ResultCard.displayName = 'ResultCard';

// Loading skeleton component
const ResultSkeleton: React.FC = () => (
  <Card className="p-4">
    <div className="flex items-start justify-between mb-2">
      <div className="flex items-center space-x-2">
        <Skeleton className="w-5 h-5" />
        <Skeleton className="h-6 w-32" />
      </div>
      <Skeleton className="w-12 h-4" />
    </div>
    <Skeleton className="h-4 w-full mb-2" />
    <Skeleton className="h-4 w-3/4 mb-3" />
    <div className="flex items-center space-x-2">
      <Skeleton className="h-5 w-20" />
      <Skeleton className="h-5 w-16" />
    </div>
  </Card>
);

export const VirtualSearchResults: React.FC<VirtualSearchResultsProps> = ({
  results,
  loading = false,
  query,
  className,
}) => {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  
  const { isFavorite, addFavorite, removeFavorite, addToast } = useAppStore();

  // Virtual scrolling setup
  const { visibleItems, totalHeight, offsetY, containerRef: virtualContainerRef } = useVirtualScroll(
    results,
    {
      itemHeight: 180, // Estimated height of each result card
      containerHeight: window.innerHeight - 200,
      overscan: 3,
    }
  );

  // Handle result click
  const handleResultClick = useCallback((result: Document) => {
    const name = result.name || result.title;
    const { section } = result;
    navigate(`/docs/${name}/${section}`);
  }, [navigate]);

  // Handle favorite toggle
  const handleFavoriteToggle = useCallback((doc: Document) => {
    if (!doc.name) {
      addToast('Cannot favorite this document', 'error');
      return;
    }
    
    const docKey = `${doc.name}.${doc.section}`;
    if (isFavorite(docKey)) {
      removeFavorite(docKey);
      addToast(`Removed ${doc.name} from favorites`, 'info');
    } else {
      addFavorite(docKey);
      addToast(`Added ${doc.name} to favorites`, 'success');
    }
  }, [isFavorite, addFavorite, removeFavorite, addToast]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (results.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, -1));
        break;
      case 'Enter':
        if (selectedIndex >= 0 && selectedIndex < results.length) {
          handleResultClick(results[selectedIndex]);
        }
        break;
    }
  }, [results, selectedIndex, handleResultClick]);

  // Focus management
  useEffect(() => {
    if (selectedIndex >= 0 && containerRef.current) {
      const items = containerRef.current.querySelectorAll('[data-result-index]');
      const selectedItem = items[selectedIndex] as HTMLElement;
      selectedItem?.focus();
      selectedItem?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedIndex]);

  // Show loading skeletons
  if (loading) {
    return (
      <div className={cn("space-y-4", className)}>
        {[...Array(5)].map((_, i) => (
          <ResultSkeleton key={i} />
        ))}
      </div>
    );
  }

  // Show empty state
  if (!loading && results.length === 0) {
    return (
      <div className={cn("text-center py-12", className)}
      >
        <FileTextIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
          No results found
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          {query ? `No man pages found for "${query}"` : "Try searching for a command"}
        </p>
      </div>
    );
  }

  // Virtual scrolling container
  return (
    <div ref={containerRef} className={cn("relative focus:outline-none", className)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="list"
      aria-label="Search results"
    >
      <div ref={virtualContainerRef} className="relative overflow-auto"
        style={{ height: '600px' }} // Fixed height for virtual scrolling
      >
        <div style={{ height: `${totalHeight}px` }}>
          <div
            style={{ transform: `translateY(${offsetY}px)` }}
            className="space-y-4"
          >
            <>
              {visibleItems.map((result, index) => {
                const globalIndex = results.indexOf(result);
                const docName = result.name || result.title;
                const docKey = docName ? `${docName}.${result.section}` : '';
                
                return (
                  <div
                    key={`${docName}-${result.section}-${result.id}`}
                    data-result-index={globalIndex}
                    tabIndex={0}
                    role="listitem"
                    aria-label={`${docName} - ${result.summary}`}
                    className={cn(
                      "focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg",
                      selectedIndex === globalIndex && "ring-2 ring-blue-500"
                    )}
                  >
                    <ResultCard
                      result={result}
                      query={query}
                      isFavorite={isFavorite(docKey)}
                      onFavoriteToggle={() => handleFavoriteToggle(result)}
                      onClick={() => handleResultClick(result)}
                      index={index}
                    />
                  </div>
                );
              })}
            </>
          </div>
        </div>
      </div>

      {/* Results summary */}
      <div className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
        Showing {visibleItems.length} of {results.length} results
        {query && <span> for "{query}"</span>}
      </div>
    </div>
  );
};