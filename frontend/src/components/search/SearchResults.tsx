import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  BookmarkIcon,
  ClockIcon,
  FileTextIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  HashtagIcon,
} from '@radix-ui/react-icons';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/stores/appStore';
import { useSearchStore } from '@/stores/searchStore';
import { cn } from '@/utils/cn';
import type { Document } from '@/types';

interface SearchResultsProps {
  className?: string;
  onDocumentSelect?: (doc: Document) => void;
}

export const SearchResults: React.FC<SearchResultsProps> = ({ 
  className, 
  onDocumentSelect 
}) => {
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [sortBy, setSortBy] = useState<'relevance' | 'name' | 'section'>('relevance');
  
  const { 
    results, 
    loading, 
    error, 
    query,
    total,
    page,
    per_page,
    has_more 
  } = useSearchStore();
  
  const { isFavorite, addFavorite, removeFavorite, addRecentDoc } = useAppStore();
  
  const handleDocumentClick = (doc: Document) => {
    addRecentDoc(doc);
    if (onDocumentSelect) {
      onDocumentSelect(doc);
    }
  };
  
  const toggleFavorite = (e: React.MouseEvent, docId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (isFavorite(docId)) {
      removeFavorite(docId);
    } else {
      addFavorite(docId);
    }
  };
  
  // Sort results
  const sortedResults = [...results].sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return a.title.localeCompare(b.title);
      case 'section':
        return a.section - b.section;
      case 'relevance':
      default:
        return b.score - a.score;
    }
  });
  
  if (loading) {
    return (
      <div className={cn('space-y-4', className)}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
          >
            <div className="animate-pulse">
              <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2" />
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full mb-3" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  
  if (error) {
    return (
      <div className={cn('text-center py-12', className)}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 max-w-md mx-auto"
        >
          <MagnifyingGlassIcon className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-red-800 dark:text-red-300 mb-2">
            Search Error
          </h3>
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </motion.div>
      </div>
    );
  }
  
  if (!query) {
    return (
      <div className={cn('text-center py-12', className)}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md mx-auto"
        >
          <MagnifyingGlassIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">
            Search Documentation
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            Start typing to search through thousands of man pages and documentation.
          </p>
        </motion.div>
      </div>
    );
  }
  
  if (results.length === 0) {
    return (
      <div className={cn('text-center py-12', className)}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md mx-auto"
        >
          <FileTextIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">
            No Results Found
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            No documentation found for "{query}". Try different keywords or check your spelling.
          </p>
          <div className="space-y-2 text-sm text-gray-500 dark:text-gray-400">
            <p>Suggestions:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Try broader search terms</li>
              <li>Use common command names (ls, grep, find)</li>
              <li>Check for typos</li>
            </ul>
          </div>
        </motion.div>
      </div>
    );
  }
  
  return (
    <div className={cn('space-y-6', className)}>
      {/* Results header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {total.toLocaleString()} results for "{query}"
          </h2>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Page {page} of {Math.ceil(total / per_page)}
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          >
            <option value="relevance">Sort by Relevance</option>
            <option value="name">Sort by Name</option>
            <option value="section">Sort by Section</option>
          </select>
        </div>
      </div>
      
      {/* Results list */}
      <motion.div layout className="space-y-3">
        <AnimatePresence mode="popLayout">
          {sortedResults.map((doc, index) => (
            <motion.div
              key={doc.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ delay: index * 0.05 }}
            >
              <SearchResultCard
                document={doc}
                isFavorite={doc.name ? isFavorite(`${doc.name}.${doc.section}`) : false}
                onToggleFavorite={(e) => doc.name && toggleFavorite(e, `${doc.name}.${doc.section}`)}
                onClick={() => handleDocumentClick(doc)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
      
      {/* Load more */}
      {has_more && (
        <div className="text-center py-6">
          <Button
            variant="outline"
            onClick={() => {/* TODO: Load more results */}}
            disabled={loading}
          >
            Load More Results
          </Button>
        </div>
      )}
    </div>
  );
};

interface SearchResultCardProps {
  document: Document;
  isFavorite: boolean;
  onToggleFavorite: (e: React.MouseEvent) => void;
  onClick: () => void;
}

const SearchResultCard: React.FC<SearchResultCardProps> = ({
  document,
  isFavorite,
  onToggleFavorite,
  onClick,
}) => {
  return (
    <Link
      to={`/docs/${document.name || document.id}.${document.section}`}
      onClick={onClick}
      className="block group"
    >
      <motion.div
        whileHover={{ y: -2 }}
        className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-600 transition-all duration-200"
      >
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            {/* Title and section */}
            <div className="flex items-center space-x-3 mb-2">
              <h3 className="text-lg font-semibold font-mono text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                {document.title}
              </h3>
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                Section {document.section}
              </span>
              {document.doc_set && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
                  {document.doc_set}
                </span>
              )}
            </div>
            
            {/* Summary */}
            <p className="text-gray-600 dark:text-gray-400 mb-3 leading-relaxed">
              {document.summary}
            </p>
            
            {/* Matches preview */}
            {document.matches && document.matches.length > 0 && (
              <div className="space-y-1">
                {document.matches.slice(0, 2).map((match, index) => (
                  <div
                    key={index}
                    className="text-sm font-mono bg-gray-50 dark:bg-gray-700 rounded px-2 py-1 text-gray-700 dark:text-gray-300"
                  >
                    {match.length > 100 ? `${match.substring(0, 100)}...` : match}
                  </div>
                ))}
              </div>
            )}
            
            {/* Tags */}
            {document.tags && document.tags.length > 0 && (
              <div className="flex items-center space-x-2 mt-3">
                <HashtagIcon className="w-4 h-4 text-gray-400" />
                <div className="flex flex-wrap gap-1">
                  {document.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          {/* Actions */}
          <div className="flex items-start space-x-2 ml-4">
            <div className="text-sm text-gray-500 dark:text-gray-400 text-right">
              <div className="flex items-center space-x-1">
                <span>Score:</span>
                <span className="font-medium">{document.score.toFixed(1)}</span>
              </div>
              {document.last_updated && (
                <div className="flex items-center space-x-1 mt-1">
                  <ClockIcon className="w-3 h-3" />
                  <span className="text-xs">
                    {new Date(document.last_updated).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleFavorite}
              className={cn(
                'w-8 h-8 opacity-0 group-hover:opacity-100 transition-opacity',
                isFavorite && 'opacity-100 text-blue-500'
              )}
            >
              <BookmarkIcon className={cn('w-4 h-4', isFavorite && 'fill-current')} />
            </Button>
            
            <ChevronRightIcon className="w-5 h-5 text-gray-400 group-hover:text-blue-500 transition-colors" />
          </div>
        </div>
      </motion.div>
    </Link>
  );
};