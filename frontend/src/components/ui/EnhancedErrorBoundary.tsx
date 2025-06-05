import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { AlertCircle, RefreshCw, Home, Bug } from 'lucide-react';
import { api } from '@/services/api';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string | null;
  reportSent: boolean;
  retryCount: number;
}

export class EnhancedErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
      reportSent: false,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
      errorId: null,
      reportSent: false,
      retryCount: 0,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    
    // Update state with error info
    this.setState({
      errorInfo,
    });
    
    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
    
    // Report error to backend
    this.reportError(error, errorInfo);
  }

  async reportError(error: Error, errorInfo: ErrorInfo) {
    try {
      const response = await api.post('/error-report', {
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
        errorInfo: {
          componentStack: errorInfo.componentStack,
        },
        userAgent: navigator.userAgent,
        url: window.location.href,
        timestamp: new Date().toISOString(),
      });
      
      this.setState({
        errorId: response.data.error_id,
        reportSent: true,
      });
    } catch (reportError) {
      console.error('Failed to report error:', reportError);
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
      reportSent: false,
      retryCount: this.state.retryCount + 1,
    });
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return <>{this.props.fallback}</>;
      }

      const { error, errorInfo, errorId, reportSent, retryCount } = this.state;
      const isDevelopment = process.env.NODE_ENV === 'development';

      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-900">
          <Card variant="elevated" className="max-w-2xl w-full">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-full">
                  <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <CardTitle className="text-xl">Something went wrong</CardTitle>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    An unexpected error occurred while rendering this page
                  </p>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-6">
              {/* Error Summary */}
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-gray-900 dark:text-gray-100">
                    Error Details
                  </h3>
                  {reportSent && (
                    <Badge variant="success" size="sm">
                      Reported
                    </Badge>
                  )}
                </div>
                
                <div className="space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <span className="text-gray-500 dark:text-gray-400">Type:</span>
                    <span className="font-mono text-gray-900 dark:text-gray-100">
                      {error?.name || 'Unknown Error'}
                    </span>
                  </div>
                  
                  <div className="flex items-start gap-2">
                    <span className="text-gray-500 dark:text-gray-400">Message:</span>
                    <span className="text-gray-900 dark:text-gray-100">
                      {error?.message || 'An unexpected error occurred'}
                    </span>
                  </div>
                  
                  {errorId && (
                    <div className="flex items-start gap-2">
                      <span className="text-gray-500 dark:text-gray-400">Error ID:</span>
                      <span className="font-mono text-xs text-gray-900 dark:text-gray-100">
                        {errorId}
                      </span>
                    </div>
                  )}
                  
                  {retryCount > 0 && (
                    <div className="flex items-start gap-2">
                      <span className="text-gray-500 dark:text-gray-400">Retry attempts:</span>
                      <span className="text-gray-900 dark:text-gray-100">
                        {retryCount}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Stack Trace (Development Only) */}
              {isDevelopment && error?.stack && (
                <details className="group">
                  <summary className="cursor-pointer flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100">
                    <Bug className="w-4 h-4" />
                    Stack Trace
                  </summary>
                  <pre className="mt-2 p-4 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto text-xs">
                    {error.stack}
                  </pre>
                </details>
              )}

              {/* Component Stack (Development Only) */}
              {isDevelopment && errorInfo?.componentStack && (
                <details className="group">
                  <summary className="cursor-pointer flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100">
                    <Bug className="w-4 h-4" />
                    Component Stack
                  </summary>
                  <pre className="mt-2 p-4 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto text-xs">
                    {errorInfo.componentStack}
                  </pre>
                </details>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-3 pt-4">
                <Button
                  onClick={this.handleReset}
                  variant="primary"
                  className="flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Try Again
                </Button>
                
                <Button
                  onClick={this.handleGoHome}
                  variant="secondary"
                  className="flex items-center gap-2"
                >
                  <Home className="w-4 h-4" />
                  Go to Home
                </Button>
                
                <Button
                  onClick={this.handleReload}
                  variant="ghost"
                >
                  Reload Page
                </Button>
              </div>

              {/* Help Text */}
              <div className="text-sm text-gray-600 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 pt-4">
                <p>
                  This error has been automatically reported to our team. 
                  If the problem persists, please try:
                </p>
                <ul className="mt-2 ml-5 list-disc space-y-1">
                  <li>Clearing your browser cache</li>
                  <li>Checking your internet connection</li>
                  <li>Using a different browser</li>
                  <li>Contacting support with error ID: {errorId || 'Not available'}</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

// Functional component wrapper for easier use with hooks
export const withErrorBoundary = <P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, 'children'>
) => {
  const WrappedComponent = (props: P) => (
    <EnhancedErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </EnhancedErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
};