import React, { Component, ErrorInfo, ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  ExclamationTriangleIcon,
  ReloadIcon,
  HomeIcon,
  CopyIcon,
  CheckIcon,
  CrossCircledIcon,
} from '@radix-ui/react-icons';
import { cn } from '@/utils/cn';

interface Props {
  children: ReactNode;
  fallback?: ComponentType<ErrorFallbackProps>;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string;
  errorCount: number;
}

interface ErrorFallbackProps {
  error: Error;
  errorInfo: ErrorInfo | null;
  errorId: string;
  resetError: () => void;
}

export class GlobalErrorHandler extends Component<Props, State> {
  private resetTimeoutId: NodeJS.Timeout | null = null;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: '',
      errorCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    const errorId = `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    return {
      hasError: true,
      error,
      errorId,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log to error reporting service
    console.error('Error caught by boundary:', error, errorInfo);
    
    // Track error count
    this.setState(prevState => ({
      errorInfo,
      errorCount: prevState.errorCount + 1,
    }));

    // Send error to analytics/monitoring
    if (window.gtag) {
      window.gtag('event', 'exception', {
        description: error.toString(),
        fatal: true,
        error_id: this.state.errorId,
      });
    }

    // Report to error tracking service (e.g., Sentry)
    if (window.Sentry) {
      window.Sentry.captureException(error, {
        contexts: {
          react: {
            componentStack: errorInfo.componentStack,
          },
        },
        tags: {
          error_boundary: true,
          error_id: this.state.errorId,
        },
      });
    }
  }

  componentWillUnmount() {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
    }
  }

  resetError = () => {
    // Clear any existing timeout
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
    }

    // Reset error state
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: '',
    });

    // Auto-reset after multiple errors to prevent infinite loops
    if (this.state.errorCount > 3) {
      this.resetTimeoutId = setTimeout(() => {
        window.location.href = '/';
      }, 5000);
    }
  };

  render() {
    if (this.state.hasError && this.state.error) {
      const FallbackComponent = this.props.fallback || DefaultErrorFallback;
      
      return (
        <FallbackComponent
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          errorId={this.state.errorId}
          resetError={this.resetError}
        />
      );
    }

    return this.props.children;
  }
}

// Default Error Fallback Component
const DefaultErrorFallback: React.FC<ErrorFallbackProps> = ({
  error,
  errorInfo,
  errorId,
  resetError,
}) => {
  const [copied, setCopied] = React.useState(false);
  const [showDetails, setShowDetails] = React.useState(false);

  const copyErrorDetails = () => {
    const errorDetails = `
Error ID: ${errorId}
Error: ${error.message}
Stack: ${error.stack}
Component Stack: ${errorInfo?.componentStack || 'N/A'}
User Agent: ${navigator.userAgent}
URL: ${window.location.href}
Time: ${new Date().toISOString()}
    `.trim();

    navigator.clipboard.writeText(errorDetails).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const isDevelopment = process.env.NODE_ENV === 'development';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl w-full"
      >
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="bg-red-50 dark:bg-red-900/20 p-6 border-b border-red-200 dark:border-red-800">
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-red-100 dark:bg-red-900/40 rounded-full flex items-center justify-center">
                  <CrossCircledIcon className="w-6 h-6 text-red-600 dark:text-red-400" />
                </div>
              </div>
              <div className="flex-1">
                <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  Oops! Something went wrong
                </h1>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  We encountered an unexpected error. The error has been logged and our team will look into it.
                </p>
                {errorId && (
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-500 font-mono">
                    Error ID: {errorId}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Error Message */}
          <div className="p-6">
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Error Details
                </h2>
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {showDetails ? 'Hide' : 'Show'} Technical Details
                </button>
              </div>
              
              <p className="text-sm text-red-600 dark:text-red-400 font-mono">
                {error.message}
              </p>

              {showDetails && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-4 space-y-4"
                >
                  {/* Stack Trace */}
                  {error.stack && (
                    <div>
                      <h3 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Stack Trace
                      </h3>
                      <pre className="text-xs text-gray-600 dark:text-gray-400 overflow-x-auto whitespace-pre-wrap bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700">
                        {error.stack}
                      </pre>
                    </div>
                  )}

                  {/* Component Stack */}
                  {isDevelopment && errorInfo?.componentStack && (
                    <div>
                      <h3 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Component Stack
                      </h3>
                      <pre className="text-xs text-gray-600 dark:text-gray-400 overflow-x-auto whitespace-pre-wrap bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700">
                        {errorInfo.componentStack}
                      </pre>
                    </div>
                  )}
                </motion.div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="p-6 pt-0 flex flex-col sm:flex-row gap-3">
            <button
              onClick={resetError}
              className={cn(
                'flex-1 flex items-center justify-center space-x-2 px-4 py-2',
                'bg-blue-600 text-white rounded-lg',
                'hover:bg-blue-700 transition-colors'
              )}
            >
              <ReloadIcon className="w-4 h-4" />
              <span>Try Again</span>
            </button>

            <a
              href="/"
              className={cn(
                'flex-1 flex items-center justify-center space-x-2 px-4 py-2',
                'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg',
                'hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors'
              )}
            >
              <HomeIcon className="w-4 h-4" />
              <span>Go Home</span>
            </a>

            <button
              onClick={copyErrorDetails}
              className={cn(
                'flex items-center justify-center space-x-2 px-4 py-2',
                'border border-gray-300 dark:border-gray-600 rounded-lg',
                'hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors'
              )}
            >
              {copied ? (
                <>
                  <CheckIcon className="w-4 h-4 text-green-500" />
                  <span className="text-sm">Copied!</span>
                </>
              ) : (
                <>
                  <CopyIcon className="w-4 h-4" />
                  <span className="text-sm">Copy Details</span>
                </>
              )}
            </button>
          </div>

          {/* Help Text */}
          <div className="px-6 pb-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <ExclamationTriangleIcon className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-700 dark:text-blue-300">
                  <p className="font-medium mb-1">Need help?</p>
                  <p>
                    If this error persists, please{' '}
                    <a
                      href="/help"
                      className="underline hover:no-underline"
                    >
                      contact support
                    </a>
                    {' '}with the error ID above.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

// Async Error Handler for Promise rejections
export const setupGlobalErrorHandlers = () => {
  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    
    // Prevent default browser behavior
    event.preventDefault();
    
    // You could show a toast notification here
    // or dispatch an action to show an error message
  });

  // Handle global errors
  window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    
    // Check if it's a chunk loading error
    if (event.message.includes('Loading chunk')) {
      // Show a user-friendly message about refreshing
      window.location.reload();
    }
  });
};

// Error Logger utility
export const logError = (error: Error, context?: Record<string, any>) => {
  const errorData = {
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
    url: window.location.href,
    userAgent: navigator.userAgent,
    ...context,
  };

  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.error('Logged error:', errorData);
  }

  // Send to error tracking service
  if (window.Sentry) {
    window.Sentry.captureException(error, {
      extra: context,
    });
  }

  // Send to analytics
  if (window.gtag) {
    window.gtag('event', 'exception', {
      description: error.message,
      fatal: false,
      ...context,
    });
  }

  return errorData;
};