import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { 
  StarIcon, 
  TrashIcon,
  MagnifyingGlassIcon,
  HeartIcon 
} from '@radix-ui/react-icons';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAppStore } from '@/stores/appStore';
import { documentAPI } from '@/services/api';
import { cn } from '@/utils/cn';
import type { Document } from '@/types';

export const FavoritesPage: React.FC = () => {
  const [favoriteDocuments, setFavoriteDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const { favorites, removeFavorite } = useAppStore();
  
  // Load favorite documents
  useEffect(() => {
    const loadFavorites = async () => {
      if (favorites.length === 0) {
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        
        // Load all favorite documents
        const docs = await Promise.all(
          favorites.map(async (docId) => {
            try {
              return await documentAPI.getDocument(docId);
            } catch (error) {
              console.error(`Failed to load document ${docId}:`, error);
              return null;
            }
          })
        );
        
        // Filter out failed loads
        const validDocs = docs.filter((doc): doc is Document => doc !== null);
        setFavoriteDocuments(validDocs);
      } catch (error) {
        console.error('Failed to load favorites:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadFavorites();
  }, [favorites]);
  
  // Filter documents based on search
  const filteredDocuments = favoriteDocuments.filter(doc =>
    doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.summary.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const handleRemoveFavorite = (docId: string) => {
    removeFavorite(docId);
    setFavoriteDocuments(prev => prev.filter(doc => doc.id !== docId));
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pt-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="space-y-6">
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4 animate-pulse" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6"
              >
                <div className="animate-pulse">
                  <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-3" />
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full mb-2" />
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-screen bg-gray-50 dark:bg-gray-900 pt-8"
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center space-x-3 mb-4">
            <StarIcon className="w-8 h-8 text-yellow-500" />
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              Favorites
            </h1>
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            Your saved documentation for quick access
          </p>
        </div>
        
        {/* Search */}
        {favoriteDocuments.length > 0 && (
          <div className="mb-6">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search your favorites..."
              leftIcon={<MagnifyingGlassIcon className="w-4 h-4" />}
            />
          </div>
        )}
        
        {/* Empty state */}
        {favoriteDocuments.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-16"
          >
            <HeartIcon className="w-16 h-16 text-gray-400 mx-auto mb-6" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              No Favorites Yet
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-md mx-auto">
              Start adding documentation to your favorites by clicking the star icon 
              on any document page.
            </p>
            <Link to="/">
              <Button>
                <MagnifyingGlassIcon className="w-4 h-4 mr-2" />
                Search Documentation
              </Button>
            </Link>
          </motion.div>
        )}
        
        {/* No search results */}
        {favoriteDocuments.length > 0 && filteredDocuments.length === 0 && searchQuery && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <MagnifyingGlassIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              No matches found
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              No favorites match "{searchQuery}"
            </p>
          </motion.div>
        )}
        
        {/* Favorites list */}
        {filteredDocuments.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {filteredDocuments.length} {filteredDocuments.length === 1 ? 'favorite' : 'favorites'}
                {searchQuery && ` matching "${searchQuery}"`}
              </h2>
            </div>
            
            <motion.div layout className="space-y-3">
              {filteredDocuments.map((doc, index) => (
                <motion.div
                  key={doc.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <FavoriteCard
                    document={doc}
                    onRemove={() => handleRemoveFavorite(doc.id)}
                  />
                </motion.div>
              ))}
            </motion.div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

interface FavoriteCardProps {
  document: Document;
  onRemove: () => void;
}

const FavoriteCard: React.FC<FavoriteCardProps> = ({ document, onRemove }) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg transition-shadow duration-200">
      <div className="flex items-start justify-between">
        <Link
          to={`/docs/${document.id}`}
          className="flex-1 min-w-0 group"
        >
          <div className="flex items-center space-x-3 mb-3">
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
          
          <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
            {document.summary}
          </p>
          
          {document.tags && document.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3">
              {document.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </Link>
        
        <div className="flex items-center space-x-2 ml-4">
          <StarIcon className="w-5 h-5 text-yellow-500 fill-current" />
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            className="text-gray-400 hover:text-red-500 dark:hover:text-red-400"
          >
            <TrashIcon className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};