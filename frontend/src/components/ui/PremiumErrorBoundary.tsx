import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { 
  AlertCircle, 
  RefreshCw, 
  Home, 
  Bug, 
  Send,
  WifiOff,
  CheckCircle,
  Copy,
  ChevronDown,
  ChevronUp,
  FileText,
  MessageSquare
} from 'lucide-react';
import { api } from '@/services/api';
import { cn } from '@/utils/cn';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  enableAutoRecovery?: boolean;
  recoveryAttempts?: number;
  showDetailedErrors?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string | null;
  reportSent: boolean;
  retryCount: number;
  isOnline: boolean;
  isRecovering: boolean;
  userFeedback: string;
  showDetails: boolean;
  showFeedback: boolean;
  feedbackSent: boolean;
  copiedErrorId: boolean;
  recoveryStrategies: RecoveryStrategy[];
  currentStrategy: number;
}

interface RecoveryStrategy {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<any>;
  action: () => void | Promise<void>;
  success?: boolean;
  attempted?: boolean;
}

export class PremiumErrorBoundary extends Component<Props, State> {
  private offlineHandler: () => void;
  private onlineHandler: () => void;
  private recoveryTimer?: NodeJS.Timeout;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
      reportSent: false,
      retryCount: 0,
      isOnline: navigator.onLine,
      isRecovering: false,
      userFeedback: '',
      showDetails: false,
      showFeedback: false,
      feedbackSent: false,
      copiedErrorId: false,
      recoveryStrategies: [],
      currentStrategy: 0,
    };

    // Bind event handlers
    this.offlineHandler = () => this.setState({ isOnline: false });
    this.onlineHandler = () => {
      this.setState({ isOnline: true });
      if (this.state.hasError && this.props.enableAutoRecovery) {
        this.attemptAutoRecovery();
      }
    };
  }

  componentDidMount() {
    // Add network status listeners
    window.addEventListener('offline', this.offlineHandler);
    window.addEventListener('online', this.onlineHandler);
  }

  componentWillUnmount() {
    // Clean up listeners
    window.removeEventListener('offline', this.offlineHandler);
    window.removeEventListener('online', this.onlineHandler);
    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
      errorInfo: null,
      errorId: null,
      reportSent: false,
      retryCount: 0,
      showDetails: false,
      showFeedback: false,
      feedbackSent: false,
      copiedErrorId: false,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    
    // Initialize recovery strategies
    const strategies = this.generateRecoveryStrategies(error);
    
    // Update state with error info
    this.setState({
      errorInfo,
      recoveryStrategies: strategies,
    });
    
    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
    
    // Report error to backend
    this.reportError(error, errorInfo);
    
    // Attempt auto-recovery if enabled
    if (this.props.enableAutoRecovery) {
      this.scheduleAutoRecovery();
    }
  }

  generateRecoveryStrategies(error: Error): RecoveryStrategy[] {
    const strategies: RecoveryStrategy[] = [
      {
        id: 'retry',
        name: 'Retry Component',
        description: 'Try to render the component again',
        icon: RefreshCw,
        action: () => this.handleReset(),
      },
      {
        id: 'reload',
        name: 'Reload Page',
        description: 'Refresh the entire page',
        icon: RefreshCw,
        action: () => window.location.reload(),
      },
      {
        id: 'home',
        name: 'Go to Home',
        description: 'Navigate to the home page',
        icon: Home,
        action: () => window.location.href = '/',
      },
    ];

    // Add cache clearing strategy if it's a state-related error
    if (error.message.includes('state') || error.message.includes('store')) {
      strategies.splice(1, 0, {
        id: 'clear-cache',
        name: 'Clear Local Data',
        description: 'Clear cached data and retry',
        icon: FileText,
        action: () => this.clearCacheAndRetry(),
      });
    }

    // Add network retry if offline
    if (!this.state.isOnline) {
      strategies.unshift({
        id: 'wait-online',
        name: 'Wait for Connection',
        description: 'Retry when internet connection is restored',
        icon: WifiOff,
        action: () => this.waitForOnlineAndRetry(),
      });
    }

    return strategies;
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
        isOnline: this.state.isOnline,
        retryCount: this.state.retryCount,
      });
      
      this.setState({
        errorId: response.data.error_id,
        reportSent: true,
      });
    } catch (reportError) {
      console.error('Failed to report error:', reportError);
      // Generate local error ID for reference
      this.setState({
        errorId: `LOCAL-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      });
    }
  }

  scheduleAutoRecovery() {
    const maxAttempts = this.props.recoveryAttempts || 3;
    if (this.state.retryCount >= maxAttempts) {
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.state.retryCount), 10000); // Exponential backoff
    this.recoveryTimer = setTimeout(() => {
      this.attemptAutoRecovery();
    }, delay);
  }

  async attemptAutoRecovery() {
    if (this.state.isRecovering) return;

    this.setState({ isRecovering: true });

    try {
      // Try each recovery strategy
      for (let i = 0; i < this.state.recoveryStrategies.length; i++) {
        const strategy = this.state.recoveryStrategies[i];
        if (!strategy.attempted) {
          this.setState({ currentStrategy: i });
          
          try {
            await strategy.action();
            // If we get here, recovery succeeded
            this.updateStrategyStatus(i, true);
            break;
          } catch (strategyError) {
            console.error(`Recovery strategy ${strategy.name} failed:`, strategyError);
            this.updateStrategyStatus(i, false);
          }
        }
      }
    } finally {
      this.setState({ isRecovering: false });
    }
  }

  updateStrategyStatus(index: number, success: boolean) {
    this.setState(prevState => ({
      recoveryStrategies: prevState.recoveryStrategies.map((strategy, i) => 
        i === index ? { ...strategy, attempted: true, success } : strategy
      ),
    }));
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
      reportSent: false,
      retryCount: this.state.retryCount + 1,
      showDetails: false,
      showFeedback: false,
      feedbackSent: false,
      copiedErrorId: false,
      recoveryStrategies: [],
      currentStrategy: 0,
    });
  };

  async clearCacheAndRetry() {
    try {
      // Clear local storage
      localStorage.clear();
      // Clear session storage
      sessionStorage.clear();
      // Clear indexed DB if used
      if ('indexedDB' in window) {
        const databases = await indexedDB.databases();
        databases.forEach(db => {
          if (db.name) indexedDB.deleteDatabase(db.name);
        });
      }
      // Reset the component
      this.handleReset();
    } catch (error) {
      console.error('Failed to clear cache:', error);
      window.location.reload();
    }
  }

  async waitForOnlineAndRetry() {
    return new Promise<void>((resolve) => {
      const checkOnline = () => {
        if (navigator.onLine) {
          this.handleReset();
          resolve();
        } else {
          setTimeout(checkOnline, 1000);
        }
      };
      checkOnline();
    });
  }

  async sendFeedback() {
    if (!this.state.userFeedback.trim()) return;

    try {
      await api.post('/error-feedback', {
        error_id: this.state.errorId,
        feedback: this.state.userFeedback,
        timestamp: new Date().toISOString(),
      });
      
      this.setState({ feedbackSent: true });
    } catch (error) {
      console.error('Failed to send feedback:', error);
    }
  }

  copyErrorId = () => {
    if (this.state.errorId) {
      navigator.clipboard.writeText(this.state.errorId);
      this.setState({ copiedErrorId: true });
      setTimeout(() => {
        this.setState({ copiedErrorId: false });
      }, 2000);
    }
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return <>{this.props.fallback}</>;
      }

      const { 
        error, 
        errorInfo, 
        errorId, 
        reportSent, 
        retryCount, 
        isOnline,
        isRecovering,
        showDetails,
        showFeedback,
        feedbackSent,
        copiedErrorId,
        recoveryStrategies,
        currentStrategy,
      } = this.state;
      
      const isDevelopment = process.env.NODE_ENV === 'development';
      const showDetailedErrors = this.props.showDetailedErrors ?? isDevelopment;

      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950">
          <Card variant="elevated" className="max-w-3xl w-full shadow-2xl">
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="p-4 bg-gradient-to-br from-red-100 to-red-200 dark:from-red-900/30 dark:to-red-800/30 rounded-full">
                      <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
                    </div>
                    {!isOnline && (
                      <div className="absolute -bottom-1 -right-1 p-1 bg-yellow-100 dark:bg-yellow-900/30 rounded-full">
                        <WifiOff className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                      </div>
                    )}
                  </div>
                  <div>
                    <CardTitle className="text-2xl font-bold">
                      Oops! Something went wrong
                    </CardTitle>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {!isOnline 
                        ? "You're offline. Some features may not work properly."
                        : "We've encountered an unexpected error."}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {reportSent && (
                    <Badge variant="success" size="sm" className="animate-fade-in">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Reported
                    </Badge>
                  )}
                  {retryCount > 0 && (
                    <Badge variant="secondary" size="sm">
                      Retry {retryCount}
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-6">
              {/* Error Summary */}
              <div className="p-4 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-850 rounded-xl">
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400 min-w-[80px]">
                      Error Type:
                    </span>
                    <span className="font-mono text-sm text-gray-900 dark:text-gray-100">
                      {error?.name || 'Unknown Error'}
                    </span>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400 min-w-[80px]">
                      Message:
                    </span>
                    <span className="text-sm text-gray-900 dark:text-gray-100">
                      {error?.message || 'An unexpected error occurred'}
                    </span>
                  </div>
                  
                  {errorId && (
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-500 dark:text-gray-400 min-w-[80px]">
                        Error ID:
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-gray-900 dark:text-gray-100 bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">
                          {errorId}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={this.copyErrorId}
                          className="p-1"
                        >
                          {copiedErrorId ? (
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Recovery Strategies */}
              {isRecovering && (
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="animate-spin">
                      <RefreshCw className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="font-medium text-blue-900 dark:text-blue-100">
                        Attempting automatic recovery...
                      </p>
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        Trying: {recoveryStrategies[currentStrategy]?.name}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Recovery Actions */}
              <div className="space-y-3">
                <h3 className="font-medium text-gray-900 dark:text-gray-100">
                  Recovery Options
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {recoveryStrategies.map((strategy) => {
                    const Icon = strategy.icon;
                    return (
                      <Button
                        key={strategy.id}
                        onClick={() => strategy.action()}
                        variant={strategy.id === 'retry' ? 'primary' : 'secondary'}
                        className={cn(
                          "flex items-center justify-start gap-3 p-4 h-auto",
                          strategy.attempted && !strategy.success && "opacity-50"
                        )}
                        disabled={isRecovering || (strategy.attempted && !strategy.success)}
                      >
                        <Icon className="w-5 h-5 flex-shrink-0" />
                        <div className="text-left">
                          <div className="font-medium">{strategy.name}</div>
                          <div className="text-xs opacity-75">
                            {strategy.description}
                          </div>
                        </div>
                        {strategy.attempted && (
                          <div className="ml-auto">
                            {strategy.success ? (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-red-500" />
                            )}
                          </div>
                        )}
                      </Button>
                    );
                  })}
                </div>
              </div>

              {/* Technical Details */}
              {showDetailedErrors && (
                <div className="space-y-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => this.setState({ showDetails: !showDetails })}
                    className="flex items-center gap-2 text-gray-600 dark:text-gray-400"
                  >
                    <Bug className="w-4 h-4" />
                    Technical Details
                    {showDetails ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </Button>
                  
                  {showDetails && (
                    <div className="space-y-3 animate-slide-down">
                      {error?.stack && (
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Stack Trace
                          </h4>
                          <pre className="p-4 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto text-xs font-mono">
                            {error.stack}
                          </pre>
                        </div>
                      )}
                      
                      {errorInfo?.componentStack && (
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Component Stack
                          </h4>
                          <pre className="p-4 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto text-xs font-mono">
                            {errorInfo.componentStack}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* User Feedback */}
              <div className="space-y-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => this.setState({ showFeedback: !showFeedback })}
                  className="flex items-center gap-2 text-gray-600 dark:text-gray-400"
                >
                  <MessageSquare className="w-4 h-4" />
                  Send Feedback
                  {showFeedback ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </Button>
                
                {showFeedback && (
                  <div className="space-y-3 animate-slide-down">
                    {!feedbackSent ? (
                      <>
                        <textarea
                          value={this.state.userFeedback}
                          onChange={(e) => this.setState({ userFeedback: e.target.value })}
                          placeholder="Help us understand what happened..."
                          className="w-full p-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none"
                          rows={3}
                        />
                        <Button
                          onClick={() => this.sendFeedback()}
                          variant="secondary"
                          size="sm"
                          disabled={!this.state.userFeedback.trim()}
                          className="flex items-center gap-2"
                        >
                          <Send className="w-4 h-4" />
                          Send Feedback
                        </Button>
                      </>
                    ) : (
                      <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                          <CheckCircle className="w-4 h-4" />
                          <span className="text-sm">Thank you for your feedback!</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Help Text */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  <p className="font-medium mb-2">Troubleshooting Tips:</p>
                  <ul className="ml-5 list-disc space-y-1">
                    <li>Clear your browser cache and cookies</li>
                    <li>Check your internet connection</li>
                    <li>Try using a different browser</li>
                    <li>Disable browser extensions temporarily</li>
                    {errorId && (
                      <li>Contact support with error ID: {errorId}</li>
                    )}
                  </ul>
                </div>
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
export const withPremiumErrorBoundary = <P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, 'children'>
) => {
  const WrappedComponent = (props: P) => (
    <PremiumErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </PremiumErrorBoundary>
  );

  WrappedComponent.displayName = `withPremiumErrorBoundary(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
};

// Hook for programmatic error handling
export function useErrorHandler() {
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    if (error) {
      throw error;
    }
  }, [error]);

  const resetError = () => setError(null);
  const captureError = (error: Error) => setError(error);

  return { resetError, captureError };
}