import React, { Suspense, ComponentType, useRef, useCallback, useState, useEffect } from 'react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface WithLazyLoadOptions {
  fallback?: React.ReactNode;
  preload?: boolean;
}

/**
 * Higher-order component for lazy loading with custom fallback
 */
export function withLazyLoad<P extends object>(
  importFunc: () => Promise<{ default: ComponentType<P> },
  options: WithLazyLoadOptions = {}
) {
  const LazyComponent = React.lazy(importFunc);
  
  // Preload component on hover if specified
  if (options.preload) {
    // Trigger import but don't use the result
    importFunc().catch(() => {
      // Silently fail preloading
    });
  }
  
  const WithLazyLoadComponent = (props: P) => {
    const fallback = options.fallback || (
      <div className="flex items-center justify-center min-h-[200px]">
        <LoadingSpinner size="md" />
      </div>
    );
    
    return (
      <Suspense fallback={fallback}
        <LazyComponent {...props />
      </Suspense>
    );
  };
  
  // Set display name for debugging
  WithLazyLoadComponent.displayName = `withLazyLoad(${LazyComponent.displayName || 'Component'})`;
  
  return WithLazyLoadComponent;
}

/**
 * Hook for preloading components
 */
export function usePreload() {
  const preloadedComponents = useRef(new Set<string>());
  
  const preload = useCallback(
    (componentName: string, importFunc: () => Promise<any>) => {
      if (!preloadedComponents.current.has(componentName)) {
        preloadedComponents.current.add(componentName);
        importFunc().catch(() => {
          // Remove from set if preload fails
          preloadedComponents.current.delete(componentName);
        });
      }
    },
    []
  );
  
  return { preload };
}

/**
 * Component for progressive enhancement
 */
export const ProgressiveEnhancement: React.FC<{
  basic: React.ReactNode;
  enhanced: React.ReactNode;
  threshold?: number;
} = ({ basic, enhanced, threshold = 1000 }) => {
  const [shouldEnhance, setShouldEnhance] = useState(false);
  
  useEffect(() => {
    // Check if user has fast connection
    const connection = (navigator as any).connection;
    const hasFastConnection = !connection || 
      connection.effectiveType === '4g' || 
      connection.effectiveType === '3g';
    
    // Enhance after delay if connection is good
    if (hasFastConnection) {
      const timer = setTimeout(() => {
        setShouldEnhance(true);
      }, threshold);
      
      return () => clearTimeout(timer);
    }
  }, [threshold]);
  
  return <>{shouldEnhance ? enhanced : basic}</>;
};