import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

interface VirtualScrollOptions {
  itemHeight: number;
  containerHeight: number;
  overscan?: number;
  getItemHeight?: (index: number) => number;
}

interface VirtualScrollReturn<T> {
  visibleItems: T[];
  totalHeight: number;
  offsetY: number;
  containerRef: React.RefObject<HTMLDivElement>;
  startIndex: number;
  endIndex: number;
}

export function useVirtualScroll<T>(
  items: T[],
  options: VirtualScrollOptions
): VirtualScrollReturn<T> {
  const {
    itemHeight,
    containerHeight,
    overscan = 3,
    getItemHeight,
  } = options;

  // Safety check for items
  const safeItems = items || [];

  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate item positions if dynamic heights
  const itemPositions = useMemo(() => {
    if (!getItemHeight) return null;
    
    const positions: number[] = [];
    let totalHeight = 0;
    
    for (let i = 0; i < safeItems.length; i++) {
      positions.push(totalHeight);
      totalHeight += getItemHeight(i);
    }
    
    return { positions, totalHeight };
  }, [safeItems.length, getItemHeight]);

  // Calculate visible range
  const { startIndex, endIndex, offsetY, totalHeight } = useMemo(() => {
    if (itemPositions) {
      // Dynamic heights
      const { positions, totalHeight: total } = itemPositions;
      let start = 0;
      let end = items.length - 1;
      
      // Binary search for start index
      let low = 0;
      let high = positions.length - 1;
      
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (positions[mid] < scrollTop) {
          start = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      
      // Find end index
      const viewportEnd = scrollTop + containerHeight;
      for (let i = start; i < positions.length; i++) {
        if (positions[i] > viewportEnd) {
          end = i;
          break;
        }
      }
      
      // Apply overscan
      start = Math.max(0, start - overscan);
      end = Math.min(safeItems.length - 1, end + overscan);
      
      return {
        startIndex: start,
        endIndex: end,
        offsetY: positions[start] || 0,
        totalHeight: total,
      };
    } else {
      // Fixed heights
      const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
      const end = Math.min(
        safeItems.length - 1,
        Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
      );
      
      return {
        startIndex: start,
        endIndex: end,
        offsetY: start * itemHeight,
        totalHeight: safeItems.length * itemHeight,
      };
    }
  }, [scrollTop, containerHeight, itemHeight, safeItems.length, overscan, itemPositions]);

  // Get visible items
  const visibleItems = useMemo(() => {
    return safeItems.slice(startIndex, endIndex + 1);
  }, [safeItems, startIndex, endIndex]);

  // Handle scroll
  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      setScrollTop(containerRef.current.scrollTop);
    }
  }, []);

  // Attach scroll listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll]);

  return {
    visibleItems,
    totalHeight,
    offsetY,
    containerRef,
    startIndex,
    endIndex,
  };
}