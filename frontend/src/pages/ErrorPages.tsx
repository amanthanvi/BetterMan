import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Home, 
  RefreshCw, 
  Search, 
  ArrowLeft,
  FileQuestion,
  ServerCrash,
  ShieldOff,
  Clock,
  WifiOff,
  AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { useOfflineState } from '@/services/offlineService';

interface ErrorPageProps {
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  actions?: React.ReactNode;
  illustration?: React.ReactNode;
}

const ErrorPageLayout: React.FC<ErrorPageProps> = ({
  title,
  description,
  icon: Icon,
  actions,
  illustration,
}) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-gray-50 dark:from-gray-900 dark:via-gray-950 dark:to-gray-900 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-8">
          {illustration || (
            <div className="relative inline-flex">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-purple-400 blur-3xl opacity-20 animate-pulse"></div>
              <div className="relative p-6 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 rounded-3xl shadow-2xl">
                <Icon className="w-16 h-16 text-gray-600 dark:text-gray-400" />
              </div>
            </div>
          )}
        </div>

        <Card variant="elevated" className="shadow-2xl border-0">
          <CardContent className="text-center py-12 px-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              {title}
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-400 mb-8 max-w-md mx-auto">
              {description}
            </p>
            {actions && (
              <div className="flex flex-wrap gap-4 justify-center">
                {actions}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-500">
            Need help? <Link to="/support" className="text-blue-600 dark:text-blue-400 hover:underline">Contact support</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <ErrorPageLayout
      title="Page Not Found"
      description="The page you're looking for doesn't exist or has been moved."
      icon={FileQuestion}
      illustration={
        <div className="relative">
          <div className="text-9xl font-bold text-gray-200 dark:text-gray-800 select-none">
            404
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <FileQuestion className="w-16 h-16 text-gray-500 dark:text-gray-500" />
          </div>
        </div>
      }
      actions={
        <>
          <Button
            variant="primary"
            size="lg"
            onClick={() => navigate('/')}
            className="min-w-[150px]"
          >
            <Home className="w-5 h-5 mr-2" />
            Go Home
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => navigate(-1)}
            className="min-w-[150px]"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Go Back
          </Button>
          <Button
            variant="ghost"
            size="lg"
            onClick={() => navigate('/search')}
            className="min-w-[150px]"
          >
            <Search className="w-5 h-5 mr-2" />
            Search
          </Button>
        </>
      }
    />
  );
};

export const ServerErrorPage: React.FC = () => {
  const handleReload = () => window.location.reload();

  return (
    <ErrorPageLayout
      title="Server Error"
      description="Something went wrong on our servers. We're working to fix it."
      icon={ServerCrash}
      illustration={
        <div className="relative">
          <div className="text-9xl font-bold text-gray-200 dark:text-gray-800 select-none">
            500
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <ServerCrash className="w-16 h-16 text-red-500 animate-pulse" />
          </div>
        </div>
      }
      actions={
        <>
          <Button
            variant="primary"
            size="lg"
            onClick={handleReload}
            className="min-w-[150px]"
          >
            <RefreshCw className="w-5 h-5 mr-2" />
            Try Again
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => window.location.href = '/'}
            className="min-w-[150px]"
          >
            <Home className="w-5 h-5 mr-2" />
            Go Home
          </Button>
        </>
      }
    />
  );
};

export const UnauthorizedPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <ErrorPageLayout
      title="Access Denied"
      description="You don't have permission to access this resource."
      icon={ShieldOff}
      illustration={
        <div className="relative">
          <div className="text-9xl font-bold text-gray-200 dark:text-gray-800 select-none">
            403
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <ShieldOff className="w-16 h-16 text-yellow-500" />
          </div>
        </div>
      }
      actions={
        <>
          <Button
            variant="primary"
            size="lg"
            onClick={() => navigate('/login')}
            className="min-w-[150px]"
          >
            Sign In
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => navigate('/')}
            className="min-w-[150px]"
          >
            <Home className="w-5 h-5 mr-2" />
            Go Home
          </Button>
        </>
      }
    />
  );
};

export const RateLimitPage: React.FC<{ retryAfter?: number }> = ({ retryAfter = 60 }) => {
  const [countdown, setCountdown] = React.useState(retryAfter);
  const navigate = useNavigate();

  React.useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          window.location.reload();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <ErrorPageLayout
      title="Rate Limit Exceeded"
      description="You've made too many requests. Please wait a moment."
      icon={Clock}
      illustration={
        <div className="relative">
          <div className="text-9xl font-bold text-gray-200 dark:text-gray-800 select-none">
            429
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative">
              <Clock className="w-16 h-16 text-orange-500" />
              <div className="absolute -bottom-2 -right-2 bg-orange-500 text-white text-xs rounded-full w-8 h-8 flex items-center justify-center font-bold">
                {countdown}
              </div>
            </div>
          </div>
        </div>
      }
      actions={
        <>
          <Button
            variant="primary"
            size="lg"
            disabled={countdown > 0}
            onClick={() => window.location.reload()}
            className="min-w-[200px]"
          >
            {countdown > 0 ? (
              <>
                <Clock className="w-5 h-5 mr-2" />
                Retry in {countdown}s
              </>
            ) : (
              <>
                <RefreshCw className="w-5 h-5 mr-2" />
                Try Again
              </>
            )}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => navigate('/')}
            className="min-w-[150px]"
          >
            <Home className="w-5 h-5 mr-2" />
            Go Home
          </Button>
        </>
      }
    />
  );
};

export const OfflinePage: React.FC = () => {
  const offlineState = useOfflineState();
  const [checking, setChecking] = React.useState(false);

  const checkConnection = async () => {
    setChecking(true);
    try {
      await fetch('/api/health');
      window.location.reload();
    } catch {
      // Still offline
    } finally {
      setChecking(false);
    }
  };

  React.useEffect(() => {
    if (offlineState.isOnline) {
      window.location.reload();
    }
  }, [offlineState.isOnline]);

  return (
    <ErrorPageLayout
      title="You're Offline"
      description="Please check your internet connection and try again."
      icon={WifiOff}
      illustration={
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-gray-400 to-gray-600 blur-3xl opacity-20 animate-pulse"></div>
          <div className="relative p-8 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 rounded-3xl shadow-2xl">
            <WifiOff className="w-20 h-20 text-gray-500 dark:text-gray-500" />
            {offlineState.connectionQuality === 'poor' && (
              <div className="absolute -top-2 -right-2 bg-yellow-500 rounded-full p-2">
                <AlertTriangle className="w-4 h-4 text-white" />
              </div>
            )}
          </div>
        </div>
      }
      actions={
        <>
          <Button
            variant="primary"
            size="lg"
            onClick={checkConnection}
            disabled={checking}
            className="min-w-[200px]"
          >
            {checking ? (
              <>
                <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                Checking...
              </>
            ) : (
              <>
                <RefreshCw className="w-5 h-5 mr-2" />
                Check Connection
              </>
            )}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => window.location.href = '/offline-mode'}
            className="min-w-[150px]"
          >
            Offline Mode
          </Button>
        </>
      }
    />
  );
};

export const MaintenancePage: React.FC<{ estimatedTime?: string }> = ({ 
  estimatedTime = '2 hours' 
}) => {
  return (
    <ErrorPageLayout
      title="Scheduled Maintenance"
      description={`We're performing scheduled maintenance. We'll be back in approximately ${estimatedTime}.`}
      icon={ServerCrash}
      illustration={
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-cyan-400 blur-3xl opacity-20 animate-pulse"></div>
          <div className="relative p-8 bg-gradient-to-br from-blue-100 to-cyan-100 dark:from-blue-900 dark:to-cyan-900 rounded-3xl shadow-2xl">
            <div className="relative">
              <ServerCrash className="w-20 h-20 text-blue-600 dark:text-blue-400" />
              <div className="absolute -bottom-2 -right-2 bg-blue-600 dark:bg-blue-400 rounded-full p-2 animate-spin">
                <RefreshCw className="w-4 h-4 text-white" />
              </div>
            </div>
          </div>
        </div>
      }
      actions={
        <>
          <Button
            variant="primary"
            size="lg"
            onClick={() => window.location.reload()}
            className="min-w-[150px]"
          >
            <RefreshCw className="w-5 h-5 mr-2" />
            Check Status
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => window.open('https://status.betterman.app', '_blank')}
            className="min-w-[150px]"
          >
            Status Page
          </Button>
        </>
      }
    />
  );
};