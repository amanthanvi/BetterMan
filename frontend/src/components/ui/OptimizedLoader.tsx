import React from 'react';
import { cn } from '@/utils/cn';

interface OptimizedLoaderProps {
  isLoading: boolean;
  error?: Error | null;
  children: React.ReactNode;
  loadingComponent?: React.ReactNode;
  errorComponent?: React.ReactNode;
  delay?: number;
  className?: string;
}

export const OptimizedLoader: React.FC<OptimizedLoaderProps> = ({
  isLoading,
  error,
  children,
  loadingComponent,
  errorComponent,
  delay = 200,
  className
}) => {
  const [showLoader, setShowLoader] = React.useState(false);

  React.useEffect(() => {
    if (isLoading) {
      const timer = setTimeout(() => setShowLoader(true), delay);
      return () => clearTimeout(timer);
    } else {
      setShowLoader(false);
    }
  }, [isLoading, delay]);

  if (error) {
    return (
      <>
        <div className={cn("error-container", className)}
        >
          {errorComponent || <DefaultError error={error} />}
        </div>
      </>
    );
  }

  return (
    <>
      {showLoader && isLoading ? (
        <div
          key="loader"
          className={cn("loader-container", className)}
        >
          {loadingComponent || <DefaultLoader />}
        </div>
      ) : (
        <div
          key="content"
          className={cn("content-container", className)}
        >
          {children}
        </div>
      )}
    </>
  );
};

const DefaultLoader: React.FC = () => (
  <div className="flex flex-col items-center justify-center min-h-[200px] space-y-4">
    <div className="relative">
      <div className="w-16 h-16 border-4 border-neutral-700 rounded-full animate-pulse" />
      <div className="absolute inset-0 w-16 h-16 border-4 border-t-primary-500 rounded-full animate-spin" />
    </div>
    <p className="text-neutral-400 animate-pulse">Loading documentation...</p>
  </div>
);

const DefaultError: React.FC<{ error: Error } = ({ error }) => (
  <div className="flex flex-col items-center justify-center min-h-[200px] space-y-4 p-8">
    <div className="w-16 h-16 bg-red-900/20 rounded-full flex items-center justify-center">
      <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </div>
    <div className="text-center">
      <h3 className="text-lg font-semibold text-neutral-200 mb-2">Something went wrong</h3>
      <p className="text-neutral-400 max-w-md">{error.message || 'An unexpected error occurred'}</p>
    </div>
    <button
      onClick={() => window.location.reload()}
      className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg transition-colors"
    >
      Reload Page
    </button>
  </div>
);

// Skeleton components for different content types
export const DocumentSkeleton: React.FC = () => (
  <div className="animate-pulse space-y-4 p-6">
    <div className="h-8 bg-neutral-800 rounded w-3/4" />
    <div className="h-4 bg-neutral-800 rounded w-1/2" />
    <div className="space-y-2 mt-8">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-4 bg-neutral-800 rounded w-full" />
      ))}
    </div>
  </div>
);

export const SearchResultsSkeleton: React.FC = () => (
  <div className="space-y-4">
    {[...Array(5)].map((_, i) => (
      <div key={i} className="animate-pulse p-4 bg-neutral-900 rounded-lg">
        <div className="h-5 bg-neutral-800 rounded w-1/3 mb-2" />
        <div className="h-4 bg-neutral-800 rounded w-full mb-2" />
        <div className="h-3 bg-neutral-800 rounded w-2/3" />
      </div>
    ))}
  </div>
);

export const ListSkeleton: React.FC<{ count?: number } = ({ count = 10 }) => (
  <div className="space-y-2">
    {[...Array(count)].map((_, i) => (
      <div key={i} className="animate-pulse flex items-center space-x-4 p-3">
        <div className="h-10 w-10 bg-neutral-800 rounded" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-neutral-800 rounded w-3/4" />
          <div className="h-3 bg-neutral-800 rounded w-1/2" />
        </div>
      </div>
    ))}
  </div>
);