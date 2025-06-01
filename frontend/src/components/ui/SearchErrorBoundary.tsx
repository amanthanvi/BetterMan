import React from 'react';
import { ExclamationTriangleIcon, ReloadIcon } from '@radix-ui/react-icons';
import { Button } from './Button';

interface SearchErrorBoundaryProps {
  children: React.ReactNode;
  onRetry?: () => void;
}

interface SearchErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class SearchErrorBoundary extends React.Component<SearchErrorBoundaryProps, SearchErrorBoundaryState> {
  constructor(props: SearchErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): SearchErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Search error caught by boundary:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError) {
      const isBrowserExtension = 
        this.state.error?.message?.includes('Decoding failed') ||
        this.state.error?.message?.includes('browser extension');

      return (
        <div className="flex flex-col items-center justify-center py-12 px-4">
          <div className="w-16 h-16 bg-yellow-100 dark:bg-yellow-900/20 rounded-full flex items-center justify-center mb-4">
            <ExclamationTriangleIcon className="w-8 h-8 text-yellow-600 dark:text-yellow-400" />
          </div>
          
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            {isBrowserExtension ? 'Browser Extension Interference' : 'Search Error'}
          </h3>
          
          <p className="text-gray-600 dark:text-gray-400 text-center max-w-md mb-6">
            {isBrowserExtension ? (
              <>
                A browser extension is interfering with search requests. 
                Try disabling extensions or using incognito mode.
              </>
            ) : (
              'An error occurred while searching. Please try again.'
            )}
          </p>

          <div className="flex gap-3">
            <Button
              onClick={this.handleRetry}
              variant="primary"
              className="flex items-center gap-2"
            >
              <ReloadIcon className="w-4 h-4" />
              Retry Search
            </Button>
            
            {isBrowserExtension && (
              <Button
                onClick={() => window.location.reload()}
                variant="outline"
              >
                Reload Page
              </Button>
            )}
          </div>

          {this.state.error && !isBrowserExtension && (
            <details className="mt-4 text-sm text-gray-500 dark:text-gray-400">
              <summary className="cursor-pointer">Technical Details</summary>
              <pre className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs overflow-auto max-w-md">
                {this.state.error.stack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}