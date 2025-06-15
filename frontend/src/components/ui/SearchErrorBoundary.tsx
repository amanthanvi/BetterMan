import React, { lazy, Suspense } from 'react';
import { ExclamationTriangleIcon, ReloadIcon } from '@radix-ui/react-icons';
import { Button } from './Button';

interface SearchErrorBoundaryProps {
  children: React.ReactNode;
  onRetry?: () => void;
}

// Simple fallback component
function ErrorBoundaryFallback() {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <ExclamationTriangleIcon className="w-12 h-12 text-amber-500 mb-4" />
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
        Loading Error Handler...
      </h2>
    </div>
  );
}

// Wrapper component that handles the error boundary
export function SearchErrorBoundary({ children, onRetry }: SearchErrorBoundaryProps) {
  const [hasError, setHasError] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error('Error caught by SearchErrorBoundary:', event.error);
      setHasError(true);
      setError(event.error);
      event.preventDefault();
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  const handleReset = () => {
    setHasError(false);
    setError(null);
    onRetry?.();
  };

  if (hasError) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <ExclamationTriangleIcon className="w-12 h-12 text-amber-500 mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Search Error
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-4 max-w-md">
          Something went wrong with the search functionality. Please try again or refresh the page.
        </p>
        {error && (
          <details className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            <summary className="cursor-pointer">Error details</summary>
            <pre className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded text-left overflow-auto">
              {error.message}
            </pre>
          </details>
        )}
        <div className="flex gap-2">
          {onRetry && (
            <Button
              onClick={handleReset}
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

  return <>{children}</>;
}