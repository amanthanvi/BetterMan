import React from 'react';
import { ExclamationTriangleIcon, ReloadIcon } from '@radix-ui/react-icons';
import { Button } from './Button';

// Ensure React is available
const ReactModule = React || (window as any).React;

interface SearchErrorBoundaryProps {
  children: React.ReactNode;
  onRetry?: () => void;
}

interface SearchErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class SearchErrorBoundary extends ReactModule.Component<SearchErrorBoundaryProps, SearchErrorBoundaryState> {
  constructor(props: SearchErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): SearchErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Search Error Boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <ExclamationTriangleIcon className="w-12 h-12 text-amber-500 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Search Error
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4 max-w-md">
            Something went wrong with the search functionality. Please try again or refresh the page.
          </p>
          {this.state.error && (
            <details className="mb-4 text-sm text-gray-500 dark:text-gray-400">
              <summary className="cursor-pointer">Error details</summary>
              <pre className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded text-left overflow-auto">
                {this.state.error.message}
              </pre>
            </details>
          )}
          <div className="flex gap-2">
            {this.props.onRetry && (
              <Button
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  this.props.onRetry?.();
                }}
                variant="primary"
                size="sm"
                leftIcon={<ReloadIcon className="w-4 h-4" />}
              >
                Try Again
              </Button>
            )}
            <Button
              onClick={() => window.location.reload()}
              variant="secondary"
              size="sm"
            >
              Refresh Page
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}