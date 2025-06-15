import React, { useRef, useCallback, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@/utils/cn';

interface VirtualizedListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  itemHeight?: number | ((index: number) => number);
  overscan?: number;
  className?: string;
  containerClassName?: string;
  onEndReached?: () => void;
  endReachedThreshold?: number;
  emptyComponent?: React.ReactNode;
  headerComponent?: React.ReactNode;
  footerComponent?: React.ReactNode;
}

export function VirtualizedList<T>({
  items,
  renderItem,
  itemHeight = 60,
  overscan = 5,
  className,
  containerClassName,
  onEndReached,
  endReachedThreshold = 200,
  emptyComponent,
  headerComponent,
  footerComponent,
}: VirtualizedListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const scrollingRef = useRef<number | null>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback(
      (index: number) => {
        if (typeof itemHeight === 'function') {
          return itemHeight(index);
        }
        return itemHeight;
      },
      [itemHeight]
    ),
    overscan,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  // Handle infinite scroll
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      const scrollTop = target.scrollTop;
      const scrollHeight = target.scrollHeight;
      const clientHeight = target.clientHeight;

      // Clear previous scroll timeout
      if (scrollingRef.current !== null) {
        clearTimeout(scrollingRef.current);
      }

      // Set scrolling state with debounce
      scrollingRef.current = window.setTimeout(() => {
        scrollingRef.current = null;
      }, 150);

      // Check if we've reached the end
      if (
        onEndReached &&
        scrollHeight - scrollTop - clientHeight < endReachedThreshold
      ) {
        onEndReached();
      }
    },
    [onEndReached, endReachedThreshold]
  );

  // Memoize empty state
  const emptyState = useMemo(() => {
    if (items.length === 0 && emptyComponent) {
      return <div className="p-8">{emptyComponent}</div>;
    }
    return null;
  }, [items.length, emptyComponent]);

  if (items.length === 0 && emptyComponent) {
    return emptyState;
  }

  return (
    <div className={cn("flex flex-col h-full", containerClassName)}
      {headerComponent}
      <div ref={parentRef}
        className={cn(
          "flex-1 overflow-auto scrollbar-thin scrollbar-thumb-neutral-700 scrollbar-track-transparent",
          className
        )}
        onScroll={handleScroll}
      >
        <div
          style={{
            height: `${totalSize}px`,
            width: '100%',
            position: 'relative',
          >
        >
          {virtualItems.map((virtualItem) => {
            const item = items[virtualItem.index];
            return (
              <div key={virtualItem.key}
                    style={{ position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%', }
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                >
              >
                {renderItem(item, virtualItem.index)}
              </div>
            );
          })}
        </div>
      </div>
      {footerComponent}
    </div>
  );
}

// Optimized list item wrapper with intersection observer
interface ListItemWrapperProps {
  children: React.ReactNode;
  onVisible?: () => void;
  threshold?: number;
  rootMargin?: string;
  className?: string;
}

export const ListItemWrapper: React.FC<ListItemWrapperProps> = ({
  children,
  onVisible,
  threshold = 0.1,
  rootMargin = '50px',
  className,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const hasBeenVisible = useRef(false);

  React.useEffect(() => {
    if (!onVisible || hasBeenVisible.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasBeenVisible.current) {
            hasBeenVisible.current = true;
            onVisible();
          }
        });
      },
      { threshold, rootMargin }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      if (ref.current) {
        observer.unobserve(ref.current);
      }
    };
  }, [onVisible, threshold, rootMargin]);

  return (
    <div ref={ref} className={className}
      {children}
    </div>
  );
};

// Pre-built virtualized document list
interface Document {
  id: string;
  name: string;
  title: string;
  summary?: string;
  section?: string;
}

interface VirtualizedDocumentListProps {
  documents: Document[];
  onDocumentClick: (doc: Document) => void;
  onEndReached?: () => void;
  isLoading?: boolean;
  className?: string;
}

export const VirtualizedDocumentList: React.FC<VirtualizedDocumentListProps> = ({
  documents,
  onDocumentClick,
  onEndReached,
  isLoading,
  className,
}) => {
  const renderDocument = useCallback(
    (doc: Document) => (
      <ListItemWrapper
        className="border-b border-neutral-800 hover:bg-neutral-900/50 transition-colors cursor-pointer"
        onVisible={() => {
          // Could prefetch document data here
        }
      >
        <div className="p-4"
          onClick={() => onDocumentClick(doc)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              onDocumentClick(doc);
            }
          }}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="font-medium text-neutral-100">
                {doc.name}
                {doc.section && (
                  <span className="ml-2 text-sm text-neutral-500">
                    ({doc.section})
                  </span>
                )}
              </h3>
              <p className="text-sm text-neutral-400 mt-1 line-clamp-2">
                {doc.summary || doc.title}
              </p>
            </div>
            <svg
              className="w-5 h-5 text-neutral-600 flex-shrink-0 ml-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </div>
        </div>
      </ListItemWrapper>
    ),
    [onDocumentClick]
  );

  return (
    <VirtualizedList
      items={documents}
      renderItem={renderDocument}
      itemHeight={80}
      className={className}
      onEndReached={onEndReached}
      emptyComponent={
        <div className="text-center text-neutral-500 py-8">
          No documents found
        </div>
      }
      footerComponent={
        isLoading && (
          <div className="p-4 text-center text-neutral-500">
            Loading more...
          </div>
        )
    } />
  );
};