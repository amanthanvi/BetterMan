import React, { memo, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  DocumentIcon,
  StarIcon,
  ClockIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
} from '@radix-ui/react-icons';
import { cn } from '@/utils/cn';

interface SearchResult {
  id: string;
  name: string;
  title: string;
  section?: number;
  summary?: string;
  score: number;
  highlights?: string[];
}

interface OptimizedSearchResultsProps {
  results: SearchResult[];
  query: string;
  loading?: boolean;
  onResultClick?: (result: SearchResult) => void;
  className?: string;
}

// Memoized search result item
const SearchResultItem = memo<{ 
  result: SearchResult; 
  onResultClick: (result: SearchResult) => void;
  index: number;
}>(({ result, onResultClick, index }) => {
  const navigate = useNavigate();
  
  const handleClick = useCallback(() => {
    onResultClick(result);
    navigate(`/docs/${result.name}`);
  }, [result, onResultClick, navigate]);

  // Memoize section color
  const sectionColor = useMemo(() => {
    const colors = {
      1: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      2: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      3: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      4: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      5: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      6: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
      7: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
      8: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
    };
    return colors[result.section as keyof typeof colors] || colors[8];
  }, [result.section]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.02 }}
      className="group"
    >
      <button
        onClick={handleClick}
        className="w-full text-left p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 border border-gray-200 dark:border-gray-700 hover:border-indigo-500 dark:hover:border-indigo-400"
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <DocumentIcon className="w-4 h-4 text-gray-400" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                {result.title}
              </h3>
              {result.section && (
                <span className={cn('px-2 py-0.5 text-xs font-medium rounded-full', sectionColor)}>
                  Section {result.section}
                </span>
              )}
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Score: {result.score.toFixed(2)}
              </span>
            </div>
            
            {result.summary && (
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-2 line-clamp-2">
                {result.summary}
              </p>
            )}
            
            {result.highlights && result.highlights.length > 0 && (
              <div className="mt-2 space-y-1">
                {result.highlights.slice(0, 2).map((highlight, idx) => (
                  <p
                    key={idx}
                    className="text-xs text-gray-500 dark:text-gray-400 italic"
                    dangerouslySetInnerHTML={{
                      __html: highlight.replace(
                        /<mark>/g,
                        '<mark class="bg-yellow-200 dark:bg-yellow-800 font-semibold">'
                      ),
                    }}
                  />
                ))}
              </div>
            )}
          </div>
          
          <ChevronRightIcon className="w-5 h-5 text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 flex-shrink-0 ml-4" />
        </div>
      </button>
    </motion.div>
  );
});

SearchResultItem.displayName = 'SearchResultItem';

export const OptimizedSearchResults: React.FC<OptimizedSearchResultsProps> = memo(({
  results,
  query,
  loading = false,
  onResultClick = () => {},
  className,
}) => {
  // Memoize sorted results
  const sortedResults = useMemo(() => {
    return [...results].sort((a, b) => b.score - a.score);
  }, [results]);

  if (loading) {
    return (
      <div className={cn('space-y-4', className)}>
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded-lg h-24"
          />
        ))}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className={cn('text-center py-12', className)}>
        <MagnifyingGlassIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600 dark:text-gray-400">
          No results found for "{query}"
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
          Try adjusting your search terms or filters
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Found {results.length} result{results.length !== 1 ? 's' : ''} for "{query}"
        </p>
      </div>
      
      {sortedResults.map((result, index) => (
        <SearchResultItem
          key={result.id}
          result={result}
          onResultClick={onResultClick}
          index={index}
        />
      ))}
    </div>
  );
});

OptimizedSearchResults.displayName = 'OptimizedSearchResults';