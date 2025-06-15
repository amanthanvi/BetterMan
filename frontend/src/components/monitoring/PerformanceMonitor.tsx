import React, { useState, useEffect, useCallback } from 'react';
import {
  ActivityIcon,
  LightningBoltIcon,
  ExclamationTriangleIcon,
  Cross2Icon,
  ChevronRightIcon,
  ChevronDownIcon,
  ClockIcon,
  CpuIcon,
  ArchiveIcon,
  CheckCircledIcon,
  CrossCircledIcon,
} from '@radix-ui/react-icons';
import { cn } from '@/utils/cn';

interface PerformanceMetrics {
  pageLoadTime: number;
  apiCallCount: number;
  averageApiResponseTime: number;
  slowestApiCall: { endpoint: string; duration: number } | null;
  memoryUsage: number;
  renderCount: number;
  errorCount: number;
  cacheHitRate: number;
}

interface ApiCall {
  id: string;
  endpoint: string;
  method: string;
  duration: number;
  status: number;
  timestamp: number;
  size?: number;
  cached?: boolean;
}

interface PerformanceMonitorProps {
  enabled?: boolean;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  defaultExpanded?: boolean;
}

export const PerformanceMonitor: React.FC<PerformanceMonitorProps> = ({
  enabled = process.env.NODE_ENV === 'development',
  position = 'bottom-right',
  defaultExpanded = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    pageLoadTime: 0,
    apiCallCount: 0,
    averageApiResponseTime: 0,
    slowestApiCall: null,
    memoryUsage: 0,
    renderCount: 0,
    errorCount: 0,
    cacheHitRate: 0,
  });
  const [apiCalls, setApiCalls] = useState<ApiCall[]>([]);
  const [showDetails, setShowDetails] = useState(false);

  // Monitor performance
  useEffect(() => {
    if (!enabled) return;

    // Page load time
    if (window.performance && window.performance.timing) {
      const loadTime = window.performance.timing.loadEventEnd - window.performance.timing.navigationStart;
      setMetrics(prev => ({ ...prev, pageLoadTime: loadTime }));
    }

    // Memory usage monitoring
    const memoryInterval = setInterval(() => {
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        const usedMemoryMB = Math.round(memory.usedJSHeapSize / 1048576);
        setMetrics(prev => ({ ...prev, memoryUsage: usedMemoryMB }));
      }
    }, 5000);

    return () => clearInterval(memoryInterval);
  }, [enabled]);

  // Intercept fetch to monitor API calls
  useEffect(() => {
    if (!enabled) return;

    const originalFetch = window.fetch;
    let callId = 0;

    window.fetch = async function(...args) {
      const id = `api-call-${++callId}`;
      const startTime = performance.now();
      const [url, options] = args;
      const method = options?.method || 'GET';

      try {
        const response = await originalFetch.apply(this, args);
        const endTime = performance.now();
        const duration = Math.round(endTime - startTime);

        // Check if cached
        const cached = response.headers.get('X-Cache') === 'HIT' || 
                      response.headers.get('x-from-cache') === 'true';

        const apiCall: ApiCall = {
          id,
          endpoint: typeof url === 'string' ? url : url.toString(),
          method,
          duration,
          status: response.status,
          timestamp: Date.now(),
          size: parseInt(response.headers.get('content-length') || '0'),
          cached,
        };

        setApiCalls(prev => [...prev.slice(-19), apiCall]);

        // Update metrics
        setMetrics(prev => {
          const newCount = prev.apiCallCount + 1;
          const totalTime = prev.averageApiResponseTime * prev.apiCallCount + duration;
          const avgTime = Math.round(totalTime / newCount);
          
          const slowest = !prev.slowestApiCall || duration > prev.slowestApiCall.duration
            ? { endpoint: apiCall.endpoint, duration }
            : prev.slowestApiCall;

          const cachedCalls = apiCalls.filter(c => c.cached).length + (cached ? 1 : 0);
          const cacheHitRate = Math.round((cachedCalls / newCount) * 100);

          return {
            ...prev,
            apiCallCount: newCount,
            averageApiResponseTime: avgTime,
            slowestApiCall: slowest,
            cacheHitRate,
            errorCount: response.status >= 400 ? prev.errorCount + 1 : prev.errorCount,
          };
        });

        return response;
      } catch (error) {
        const endTime = performance.now();
        const duration = Math.round(endTime - startTime);

        setApiCalls(prev => [...prev.slice(-19), {
          id,
          endpoint: typeof url === 'string' ? url : url.toString(),
          method,
          duration,
          status: 0,
          timestamp: Date.now(),
        }]);

        setMetrics(prev => ({
          ...prev,
          errorCount: prev.errorCount + 1,
        }));

        throw error;
      }
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [enabled, apiCalls]);

  // Track render count
  useEffect(() => {
    if (!enabled) return;
    setMetrics(prev => ({ ...prev, renderCount: prev.renderCount + 1 }));
  });

  const getPerformanceScore = useCallback(() => {
    const scores = [
      metrics.pageLoadTime < 2000 ? 100 : metrics.pageLoadTime < 4000 ? 50 : 0,
      metrics.averageApiResponseTime < 200 ? 100 : metrics.averageApiResponseTime < 500 ? 50 : 0,
      metrics.errorCount === 0 ? 100 : metrics.errorCount < 5 ? 50 : 0,
      metrics.cacheHitRate > 70 ? 100 : metrics.cacheHitRate > 40 ? 50 : 0,
    ];
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }, [metrics]);

  const clearMetrics = useCallback(() => {
    setMetrics({
      pageLoadTime: metrics.pageLoadTime, // Keep page load time
      apiCallCount: 0,
      averageApiResponseTime: 0,
      slowestApiCall: null,
      memoryUsage: metrics.memoryUsage, // Keep current memory
      renderCount: 0,
      errorCount: 0,
      cacheHitRate: 0,
    });
    setApiCalls([]);
  }, [metrics.pageLoadTime, metrics.memoryUsage]);

  if (!enabled) return null;

  const positionClasses = {
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4',
  };

  const score = getPerformanceScore();
  const scoreColor = score >= 75 ? 'text-green-500' : score >= 50 ? 'text-yellow-500' : 'text-red-500';

  return (
    <div className={cn('fixed z-50', positionClasses[position])}
      <>
        {!isExpanded ? (
          <button
            onClick={() => setIsExpanded(true)}
            className={cn(
              'p-3 rounded-full shadow-lg',
              'bg-white dark:bg-gray-800',
              'border border-gray-200 dark:border-gray-700',
              'hover:shadow-xl transition-shadow',
              'group'
            )}
          >
            <ActivityIcon className={cn('w-5 h-5', scoreColor)} />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full animate-pulse"} />
          </button>
        ) : (
          <div className={cn(
              'w-96 bg-white dark:bg-gray-800',
              'border border-gray-200 dark:border-gray-700',
              'rounded-xl shadow-2xl',
              'overflow-hidden'
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center space-x-2">
                <ActivityIcon className="w-5 h-5 text-blue-500" />
                <h3 className="font-semibold">Performance Monitor</h3>
                <span className={cn('text-sm font-medium', scoreColor)}
                  {score}%
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={clearMetrics}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                  title="Clear metrics"
                >
                  <ArchiveIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsExpanded(false)}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Cross2Icon className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Metrics */}
            <div className="p-4 space-y-3">
              {/* Page Load */}
              <MetricRow
                icon={<ClockIcon className="w-4 h-4" /}
                label="Page Load"
                value={`${metrics.pageLoadTime}ms`}
                status={metrics.pageLoadTime < 2000 ? 'good' : metrics.pageLoadTime < 4000 ? 'warning' : 'error'}
              />

              {/* API Performance */}
              <MetricRow
                icon={<LightningBoltIcon className="w-4 h-4" /}
                label="API Response"
                value={`${metrics.averageApiResponseTime}ms avg`}
                status={metrics.averageApiResponseTime < 200 ? 'good' : metrics.averageApiResponseTime < 500 ? 'warning' : 'error'}
                detail={`${metrics.apiCallCount} calls`}
              />

              {/* Cache Hit Rate */}
              <MetricRow
                icon={<ArchiveIcon className="w-4 h-4" /}
                label="Cache Hit Rate"
                value={`${metrics.cacheHitRate}%`}
                status={metrics.cacheHitRate > 70 ? 'good' : metrics.cacheHitRate > 40 ? 'warning' : 'error'}
              />

              {/* Memory Usage */}
              <MetricRow
                icon={<CpuIcon className="w-4 h-4" /}
                label="Memory Usage"
                value={`${metrics.memoryUsage}MB`}
                status={metrics.memoryUsage < 100 ? 'good' : metrics.memoryUsage < 200 ? 'warning' : 'error'}
              />

              {/* Errors */}
              <MetricRow
                icon={<ExclamationTriangleIcon className="w-4 h-4" /}
                label="Errors"
                value={metrics.errorCount.toString()}
                status={metrics.errorCount === 0 ? 'good' : metrics.errorCount < 5 ? 'warning' : 'error'}
              />

              {/* Renders */}
              <MetricRow
                icon={<ActivityIcon className="w-4 h-4" /}
                label="Render Count"
                value={metrics.renderCount.toString()}
                status="neutral"
              />
            </div>

            {/* API Calls Details */}
            <div className="border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="w-full flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <span className="text-sm font-medium">Recent API Calls</span>
                {showDetails ? <ChevronDownIcon /> : <ChevronRightIcon />}
              </button>
              
              <>
                {showDetails && (
                  <div className="overflow-hidden"
                  >
                    <div className="max-h-48 overflow-y-auto">
                      {apiCalls.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400 p-3 text-center">
                          No API calls yet
                        </p>
                      ) : (
                        apiCalls.map(call => (
                          <ApiCallRow key={call.id} call={call} />
                        ))
                      )}
                    </div>
                  </div>
                )}
              </>
            </div>

            {/* Slowest API Call */}
            {metrics.slowestApiCall && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800">
                <p className="text-xs text-red-700 dark:text-red-400">
                  Slowest: {metrics.slowestApiCall.endpoint.split('/').pop()} ({metrics.slowestApiCall.duration}ms)
                </p>
              </div>
            )}
          </div>
        )}
      </>
    </div>
  );
};

interface MetricRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  status: 'good' | 'warning' | 'error' | 'neutral';
  detail?: string;
}

const MetricRow: React.FC<MetricRowProps> = ({ icon, label, value, status, detail }) => {
  const statusColors = {
    good: 'text-green-500',
    warning: 'text-yellow-500',
    error: 'text-red-500',
    neutral: 'text-gray-500',
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <span className={cn('text-gray-400 dark:text-gray-500', statusColors[status])}
          {icon}
        </span>
        <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
      </div>
      <div className="flex items-center space-x-2">
        <span className={cn('text-sm font-medium', statusColors[status])}
          {value}
        </span>
        {detail && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            ({detail})
          </span>
        )}
      </div>
    </div>
  );
};

interface ApiCallRowProps {
  call: ApiCall;
}

const ApiCallRow: React.FC<ApiCallRowProps> = ({ call }) => {
  const endpoint = call.endpoint.replace(/^.*\/api\//, '/api/');
  const isError = call.status >= 400 || call.status === 0;
  
  return (
    <div className={cn(
      'flex items-center justify-between px-3 py-2 text-xs',
      'border-b border-gray-100 dark:border-gray-700',
      'hover:bg-gray-50 dark:hover:bg-gray-700'
    )}
      <div className="flex items-center space-x-2 flex-1 min-w-0">
        {isError ? (
          <CrossCircledIcon className="w-3 h-3 text-red-500 flex-shrink-0" />
        ) : call.cached ? (
          <ArchiveIcon className="w-3 h-3 text-blue-500 flex-shrink-0" />
        ) : (
          <CheckCircledIcon className="w-3 h-3 text-green-500 flex-shrink-0" />
        )}
        <span className="font-mono truncate">{endpoint}</span>
        <span className="text-gray-500">{call.method}</span>
      </div>
      <div className="flex items-center space-x-2 ml-2">
        <span className={cn(
          'font-medium',
          call.duration < 200 ? 'text-green-500' : 
          call.duration < 500 ? 'text-yellow-500' : 'text-red-500'
        )}
          {call.duration}ms
        </span>
        {call.size && call.size > 0 && (
          <span className="text-gray-400">
            {(call.size / 1024).toFixed(1)}KB
          </span>
        )}
      </div>
    </div>
  );
};