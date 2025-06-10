import { api } from './api';

interface ErrorContext {
  userId?: string;
  sessionId?: string;
  component?: string;
  action?: string;
  metadata?: Record<string, any>;
}

interface ErrorReport {
  errorId: string;
  timestamp: string;
  error: {
    name: string;
    message: string;
    stack?: string;
  };
  context: ErrorContext;
  environment: {
    userAgent: string;
    url: string;
    viewport: {
      width: number;
      height: number;
    };
    screen: {
      width: number;
      height: number;
    };
    isOnline: boolean;
    language: string;
  };
}

class ErrorTracker {
  private static instance: ErrorTracker;
  private errorQueue: ErrorReport[] = [];
  private isOnline: boolean = navigator.onLine;
  private sessionId: string;
  private userId?: string;
  private metadata: Record<string, any> = {};

  private constructor() {
    this.sessionId = this.generateSessionId();
    this.setupEventListeners();
    this.setupGlobalErrorHandlers();
  }

  static getInstance(): ErrorTracker {
    if (!ErrorTracker.instance) {
      ErrorTracker.instance = new ErrorTracker();
    }
    return ErrorTracker.instance;
  }

  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private setupEventListeners() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.flushErrorQueue();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
    });

    // Track page visibility for better error context
    document.addEventListener('visibilitychange', () => {
      this.metadata.pageVisible = !document.hidden;
    });
  }

  private setupGlobalErrorHandlers() {
    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.trackError(new Error(event.reason), {
        action: 'unhandledRejection',
        metadata: { reason: event.reason },
      });
    });

    // Handle global errors
    window.addEventListener('error', (event) => {
      this.trackError(event.error || new Error(event.message), {
        action: 'globalError',
        metadata: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    });
  }

  setUser(userId: string) {
    this.userId = userId;
  }

  clearUser() {
    this.userId = undefined;
  }

  setMetadata(key: string, value: any) {
    this.metadata[key] = value;
  }

  async trackError(
    error: Error,
    context: ErrorContext = {}
  ): Promise<string> {
    const errorId = this.generateErrorId();
    
    const report: ErrorReport = {
      errorId,
      timestamp: new Date().toISOString(),
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      context: {
        userId: this.userId,
        sessionId: this.sessionId,
        ...context,
        metadata: {
          ...this.metadata,
          ...context.metadata,
        },
      },
      environment: {
        userAgent: navigator.userAgent,
        url: window.location.href,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
        screen: {
          width: window.screen.width,
          height: window.screen.height,
        },
        isOnline: this.isOnline,
        language: navigator.language,
      },
    };

    // Add to queue
    this.errorQueue.push(report);

    // Try to send immediately if online
    if (this.isOnline) {
      await this.sendError(report);
    }

    // Store in local storage for persistence
    this.persistErrorQueue();

    return errorId;
  }

  async trackMessage(
    message: string,
    level: 'info' | 'warning' | 'error' = 'info',
    context: ErrorContext = {}
  ) {
    const report = {
      messageId: this.generateErrorId(),
      timestamp: new Date().toISOString(),
      message,
      level,
      context: {
        userId: this.userId,
        sessionId: this.sessionId,
        ...context,
      },
      environment: {
        url: window.location.href,
        isOnline: this.isOnline,
      },
    };

    try {
      await api.post('/messages', report);
    } catch (error) {
      console.error('Failed to track message:', error);
    }
  }

  private generateErrorId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private async sendError(report: ErrorReport): Promise<void> {
    try {
      await api.post('/error-report', report);
      
      // Remove from queue if sent successfully
      this.errorQueue = this.errorQueue.filter((r) => r.errorId !== report.errorId);
      this.persistErrorQueue();
    } catch (error) {
      console.error('Failed to send error report:', error);
    }
  }

  private async flushErrorQueue() {
    const errors = [...this.errorQueue];
    
    for (const error of errors) {
      await this.sendError(error);
    }
  }

  private persistErrorQueue() {
    try {
      localStorage.setItem('errorQueue', JSON.stringify(this.errorQueue));
    } catch (error) {
      console.error('Failed to persist error queue:', error);
    }
  }

  private loadPersistedErrors() {
    try {
      const stored = localStorage.getItem('errorQueue');
      if (stored) {
        this.errorQueue = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load persisted errors:', error);
    }
  }

  // Performance tracking
  trackPerformance(metric: string, value: number, unit: string = 'ms') {
    // Send performance metrics
    if ('sendBeacon' in navigator) {
      const data = JSON.stringify({
        metric,
        value,
        unit,
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId,
      });
      
      navigator.sendBeacon('/api/metrics', data);
    }
  }

  // Feature usage tracking
  trackFeatureUsage(feature: string, properties?: Record<string, any>) {
    const usage = {
      feature,
      properties,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      userId: this.userId,
    };

    // Send asynchronously
    api.post('/analytics/feature-usage', usage).catch((error) => {
      console.error('Failed to track feature usage:', error);
    });
  }
}

// Export singleton instance
export const errorTracker = ErrorTracker.getInstance();

// React error boundary integration
export function trackReactError(
  error: Error,
  errorInfo: { componentStack: string }
): string {
  return errorTracker.trackError(error, {
    component: 'ReactErrorBoundary',
    metadata: {
      componentStack: errorInfo.componentStack,
    },
  });
}

// Performance observer for web vitals
export function trackWebVitals() {
  if ('PerformanceObserver' in window) {
    // Track Largest Contentful Paint
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      errorTracker.trackPerformance('lcp', lastEntry.startTime);
    });
    lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });

    // Track First Input Delay
    const fidObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry: any) => {
        errorTracker.trackPerformance('fid', entry.processingStart - entry.startTime);
      });
    });
    fidObserver.observe({ entryTypes: ['first-input'] });

    // Track Cumulative Layout Shift
    let clsValue = 0;
    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!(entry as any).hadRecentInput) {
          clsValue += (entry as any).value;
        }
      }
      errorTracker.trackPerformance('cls', clsValue, 'score');
    });
    clsObserver.observe({ entryTypes: ['layout-shift'] });
  }
}

// Network error interceptor
export function setupNetworkErrorInterceptor() {
  const originalFetch = window.fetch;
  
  window.fetch = async function(...args) {
    try {
      const response = await originalFetch.apply(this, args);
      
      if (!response.ok && response.status >= 500) {
        errorTracker.trackError(
          new Error(`Network error: ${response.status} ${response.statusText}`),
          {
            action: 'networkError',
            metadata: {
              url: args[0]?.toString(),
              status: response.status,
              statusText: response.statusText,
            },
          }
        );
      }
      
      return response;
    } catch (error) {
      errorTracker.trackError(error as Error, {
        action: 'networkError',
        metadata: {
          url: args[0]?.toString(),
        },
      });
      throw error;
    }
  };
}