import React, { useEffect, useState } from 'react';
import { cn } from '@/utils/cn';

interface PerformanceMetrics {
  fps: number;
  memory: {
    used: number;
    total: number;
    percent: number;
  };
  loadTime: number;
  renderTime: number;
  networkLatency: number;
}

interface PerformanceMonitorProps {
  enabled?: boolean;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  className?: string;
}

export const PerformanceMonitor: React.FC<PerformanceMonitorProps> = ({
  enabled = process.env.NODE_ENV === 'development',
  position = 'bottom-right',
  className,
}) => {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    fps: 60,
    memory: { used: 0, total: 0, percent: 0 },
    loadTime: 0,
    renderTime: 0,
    networkLatency: 0,
  });
  const [isMinimized, setIsMinimized] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    let frameCount = 0;
    let lastTime = performance.now();
    let rafId: number;

    // FPS calculation
    const calculateFPS = () => {
      frameCount++;
      const currentTime = performance.now();
      
      if (currentTime >= lastTime + 1000) {
        const fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
        frameCount = 0;
        lastTime = currentTime;

        // Memory usage (if available)
        const memory = (performance as any).memory;
        const memoryData = memory ? {
          used: Math.round(memory.usedJSHeapSize / 1048576),
          total: Math.round(memory.jsHeapSizeLimit / 1048576),
          percent: Math.round((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100),
        } : { used: 0, total: 0, percent: 0 };

        // Get navigation timing
        const navTiming = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        const loadTime = navTiming ? Math.round(navTiming.loadEventEnd - navTiming.fetchStart) : 0;
        const renderTime = navTiming ? Math.round(navTiming.domComplete - navTiming.domLoading) : 0;

        // Network latency (approximate from resource timings)
        const resources = performance.getEntriesByType('resource');
        const avgLatency = resources.length > 0
          ? Math.round(
              resources.reduce((sum, r) => sum + (r.responseStart - r.fetchStart), 0) / resources.length
            )
          : 0;

        setMetrics({
          fps,
          memory: memoryData,
          loadTime,
          renderTime,
          networkLatency: avgLatency,
        });
      }

      rafId = requestAnimationFrame(calculateFPS);
    };

    rafId = requestAnimationFrame(calculateFPS);

    // Report to analytics
    const reportMetrics = () => {
      if ('sendBeacon' in navigator) {
        navigator.sendBeacon('/api/analytics/performance', JSON.stringify({
          timestamp: Date.now(),
          metrics: {
            fps: metrics.fps,
            memory: metrics.memory.percent,
            loadTime: metrics.loadTime,
            renderTime: metrics.renderTime,
            networkLatency: metrics.networkLatency,
          },
        }));
      }
    };

    const interval = setInterval(reportMetrics, 30000); // Report every 30 seconds

    return () => {
      cancelAnimationFrame(rafId);
      clearInterval(interval);
    };
  }, [enabled, metrics]);

  if (!enabled) return null;

  const positionClasses = {
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4',
  };

  const getStatusColor = (value: number, thresholds: { good: number; warning: number }) => {
    if (value <= thresholds.good) return 'text-green-500';
    if (value <= thresholds.warning) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getFPSColor = (fps: number) => {
    if (fps >= 55) return 'text-green-500';
    if (fps >= 30) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <div
      className={cn(
        'fixed z-50 bg-black/80 backdrop-blur-sm text-white rounded-lg shadow-lg transition-all duration-200',
        positionClasses[position],
        isMinimized ? 'w-auto' : 'w-64',
        className
      )}
    >
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider">Performance</h3>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="text-gray-400 hover:text-white transition-colors"
          >
            {isMinimized ? '📊' : '➖'}
          </button>
        </div>

        {!isMinimized && (
          <div className="space-y-2 text-xs">
            {/* FPS */}
            <div className="flex items-center justify-between">
              <span className="text-gray-400">FPS</span>
              <span className={cn('font-mono', getFPSColor(metrics.fps))}>
                {metrics.fps}
              </span>
            </div>

            {/* Memory */}
            {metrics.memory.total > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Memory</span>
                <span className={cn('font-mono', getStatusColor(metrics.memory.percent, { good: 50, warning: 75 }))}>
                  {metrics.memory.used}MB / {metrics.memory.total}MB ({metrics.memory.percent}%)
                </span>
              </div>
            )}

            {/* Load Time */}
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Load Time</span>
              <span className={cn('font-mono', getStatusColor(metrics.loadTime, { good: 1000, warning: 3000 }))}>
                {metrics.loadTime}ms
              </span>
            </div>

            {/* Render Time */}
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Render Time</span>
              <span className={cn('font-mono', getStatusColor(metrics.renderTime, { good: 500, warning: 1000 }))}>
                {metrics.renderTime}ms
              </span>
            </div>

            {/* Network Latency */}
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Network</span>
              <span className={cn('font-mono', getStatusColor(metrics.networkLatency, { good: 100, warning: 300 }))}>
                {metrics.networkLatency}ms
              </span>
            </div>
          </div>
        )}

        {isMinimized && (
          <div className="flex items-center space-x-2 text-xs">
            <span className={cn('font-mono', getFPSColor(metrics.fps))}>{metrics.fps} FPS</span>
            {metrics.memory.total > 0 && (
              <>
                <span className="text-gray-500">•</span>
                <span className={cn('font-mono', getStatusColor(metrics.memory.percent, { good: 50, warning: 75 }))}>
                  {metrics.memory.percent}%
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};