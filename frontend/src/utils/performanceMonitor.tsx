/**
 * Performance monitoring utilities for BetterMan frontend
 */

interface PerformanceMetric {
  name: string;
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private timers: Map<string, number> = new Map();
  private enabled: boolean = true;

  constructor() {
    // Check if performance API is available
    this.enabled = typeof window !== 'undefined' && 'performance' in window;

    // Monitor Core Web Vitals
    if (this.enabled) {
      this.observeWebVitals();
    }
  }

  /**
   * Start a performance timer
   */
  startTimer(name: string): void {
    if (!this.enabled) return;
    this.timers.set(name, performance.now());
  }

  /**
   * End a timer and record the metric
   */
  endTimer(name: string, tags?: Record<string, string>): number | null {
    if (!this.enabled) return null;

    const startTime = this.timers.get(name);
    if (startTime === undefined) {
      console.warn(`Timer ${name} was not started`);
      return null;
    }

    const duration = performance.now() - startTime;
    this.timers.delete(name);

    this.recordMetric({
      name: `timer.${name}`,
      value: duration,
      timestamp: Date.now(),
      tags,
    });

    return duration;
  }

  /**
   * Record a custom metric
   */
  recordMetric(metric: PerformanceMetric): void {
    if (!this.enabled) return;

    this.metrics.push(metric);

    // Keep only last 1000 metrics to prevent memory issues
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }

    // Log slow operations
    if (metric.name.startsWith('timer.') && metric.value > 1000) {
      console.warn(`Slow operation detected: ${metric.name} took ${metric.value.toFixed(2)}ms`);
    }
  }

  /**
   * Measure component render time
   */
  measureRender(componentName: string): () => void {
    const startTime = performance.now();

    return () => {
      const duration = performance.now() - startTime;
      this.recordMetric({
        name: `render.${componentName}`,
        value: duration,
        timestamp: Date.now(),
      });
    };
  }

  /**
   * Observe Core Web Vitals
   */
  private observeWebVitals(): void {
    // Largest Contentful Paint (LCP)
    try {
      const lcpObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const lastEntry = entries[entries.length - 1] as any;
        
        this.recordMetric({
          name: 'webvital.lcp',
          value: lastEntry.renderTime || lastEntry.loadTime,
          timestamp: Date.now(),
        });
      });
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
    } catch (e) {
      // LCP observer not supported
    }

    // First Input Delay (FID)
    try {
      const fidObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        entries.forEach((entry: any) => {
          this.recordMetric({
            name: 'webvital.fid',
            value: entry.processingStart - entry.startTime,
            timestamp: Date.now(),
          });
        });
      });
      fidObserver.observe({ entryTypes: ['first-input'] });
    } catch (e) {
      // FID observer not supported
    }

    // Cumulative Layout Shift (CLS)
    let clsValue = 0;
    try {
      const clsObserver = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          if (!(entry as any).hadRecentInput) {
            clsValue += (entry as any).value;
            this.recordMetric({
              name: 'webvital.cls',
              value: clsValue,
              timestamp: Date.now(),
            });
          }
        }
      });
      clsObserver.observe({ entryTypes: ['layout-shift'] });
    } catch (e) {
      // CLS observer not supported
    }
  }

  /**
   * Get performance summary
   */
  getSummary(): {
    metrics: Record<string, { avg: number; min: number; max: number; count: number }>;
    webVitals: Record<string, number>;
  } {
    const summary: Record<string, { sum: number; count: number; min: number; max: number }> = {};

    // Aggregate metrics
    this.metrics.forEach((metric) => {
      if (!summary[metric.name]) {
        summary[metric.name] = { sum: 0, count: 0, min: Infinity, max: -Infinity };
      }
      
      summary[metric.name].sum += metric.value;
      summary[metric.name].count += 1;
      summary[metric.name].min = Math.min(summary[metric.name].min, metric.value);
      summary[metric.name].max = Math.max(summary[metric.name].max, metric.value);
    });

    // Calculate averages
    const metrics: Record<string, { avg: number; min: number; max: number; count: number }> = {};
    Object.entries(summary).forEach(([name, stats]) => {
      metrics[name] = {
        avg: stats.sum / stats.count,
        min: stats.min,
        max: stats.max,
        count: stats.count,
      };
    });

    // Extract web vitals
    const webVitals: Record<string, number> = {};
    ['lcp', 'fid', 'cls'].forEach((vital) => {
      const vitalMetrics = this.metrics
        .filter((m) => m.name === `webvital.${vital}`)
        .map((m) => m.value);
      
      if (vitalMetrics.length > 0) {
        webVitals[vital] = vitalMetrics[vitalMetrics.length - 1];
      }
    });

    return { metrics, webVitals };
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
    this.timers.clear();
  }

  /**
   * Export metrics for analysis
   */
  exportMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }
}

// Create singleton instance
export const performanceMonitor = new PerformanceMonitor();

/**
 * React hook for measuring component performance
 */
export function usePerformanceMonitor(componentName: string) {
  useEffect(() => {
    const endMeasure = performanceMonitor.measureRender(componentName);
    return endMeasure;
  }, [componentName]);
}

/**
 * Higher-order component for performance monitoring
 */
export function withPerformanceMonitor<P extends object>(
  Component: React.ComponentType<P>,
  componentName: string
): React.FC<P> {
  return (props: P) => {
    usePerformanceMonitor(componentName);
    return <Component {...props} />;
  };
}

import { useEffect } from 'react';