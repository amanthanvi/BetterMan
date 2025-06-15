import React from 'react';
import { Link } from 'react-router-dom';
import { 
  HomeIcon, 
  MagnifyingGlassIcon,
  CodeIcon,
  ArrowLeftIcon 
} from '@radix-ui/react-icons';
import { Button } from '@/components/ui/Button';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-900 dark:to-blue-950 flex items-center justify-center">
      <div className="text-center max-w-md mx-auto px-4"
      >
        {/* 404 illustration */}
        <div className="mb-8"
        >
          <div className="relative">
            <div className="text-8xl font-bold text-gray-200 dark:text-gray-800 select-none">
              404
            </div>
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
            >
              <CodeIcon className="w-16 h-16 text-blue-500" />
            </div>
          </div>
        </div>
        
        {/* Error message */}
        <div className="mb-8"
        >
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Page Not Found
          </h1>
          <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
            Sorry, we couldn't find the page you're looking for. The documentation 
            you requested might have been moved or doesn't exist.
          </p>
        </div>
        
        {/* Suggestions */}
        <div className="mb-8"
        >
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            What you can do:
          </h2>
          <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <div className="flex items-center space-x-2">
              <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
              <span>Check the URL for typos</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
              <span>Use the search to find what you need</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
              <span>Browse popular commands</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
              <span>Go back to the homepage</span>
            </div>
          </div>
        </div>
        
        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center"
        >
          <Link to="/">
            <Button className="w-full sm:w-auto">
              <HomeIcon className="w-4 h-4 mr-2" />
              Go Home
            </Button>
          </Link>
          
          <Button
            variant="outline"
            onClick={() => window.history.back()}
            className="w-full sm:w-auto"
          >
            <ArrowLeftIcon className="w-4 h-4 mr-2" />
            Go Back
          </Button>
        </div>
        
        {/* Quick search */}
        <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700"
        >
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            Or search for documentation:
          </p>
          <div className="flex items-center justify-center space-x-2 text-xs text-gray-400 dark:text-gray-500">
            <span>Press</span>
            <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded font-mono">
              ⌘K
            </kbd>
            <span>to search</span>
          </div>
        </div>
      </div>
    </div>
  );
};