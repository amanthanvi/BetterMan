import React, { useState, useEffect } from 'react';
import { 
  AlertCircle, 
  TrendingUp, 
  TrendingDown, 
  Activity,
  Clock,
  Users,
  RefreshCw,
  Download,
  Filter
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { api } from '@/services/api';
import { cn } from '@/utils/cn';

interface ErrorSummary {
  error_type: string;
  count: number;
  first_seen: string;
  last_seen: string;
  severity: string;
  affected_users: number;
}

interface ErrorTrend {
  timestamp: string;
  count: number;
  error_rate: number;
}

interface ErrorDetails {
  error: {
    id: string;
    type: string;
    message: string;
    stack_trace: string;
    severity: string;
    source: string;
    created_at: string;
    user_id?: number;
    endpoint?: string;
    user_agent?: string;
    context?: any;
    environment?: any;
  };
  feedback: Array<{
    user_id?: number;
    feedback: string;
    contact_allowed: boolean;
    created_at: string;
  }>;
}

export const ErrorAnalyticsDashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorSummary, setErrorSummary] = useState<ErrorSummary[]>([]);
  const [errorTrends, setErrorTrends] = useState<ErrorTrend[]>([]);
  const [selectedError, setSelectedError] = useState<ErrorDetails | null>(null);
  const [timeRange, setTimeRange] = useState(7); // days
  const [trendInterval, setTrendInterval] = useState<'hour' | 'day'>('hour');

  useEffect(() => {
    fetchErrorData();
  }, [timeRange, trendInterval]);

  const fetchErrorData = async () => {
    try {
      setLoading(true);
      
      // Fetch error summary
      const summaryResponse = await api.get(`/errors/summary?days=${timeRange}&limit=20`);
      setErrorSummary(summaryResponse.data);
      
      // Fetch error trends
      const hours = trendInterval === 'hour' ? Math.min(timeRange * 24, 168) : timeRange * 24;
      const trendsResponse = await api.get(`/errors/trends?hours=${hours}&interval=${trendInterval}`);
      setErrorTrends(trendsResponse.data);
      
    } catch (error) {
      console.error('Failed to fetch error data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchErrorData();
  };

  const fetchErrorDetails = async (errorId: string) => {
    try {
      const response = await api.get(`/errors/${errorId}`);
      setSelectedError(response.data);
    } catch (error) {
      console.error('Failed to fetch error details:', error);
    }
  };

  const exportErrorData = () => {
    // Create CSV export
    const headers = ['Type', 'Count', 'First Seen', 'Last Seen', 'Severity', 'Affected Users'];
    const rows = errorSummary.map(error => [
      error.error_type,
      error.count,
      new Date(error.first_seen).toLocaleString(),
      new Date(error.last_seen).toLocaleString(),
      error.severity,
      error.affected_users
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `error-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-100 dark:bg-red-900/30';
      case 'high': return 'text-orange-600 bg-orange-100 dark:bg-orange-900/30';
      case 'medium': return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30';
      case 'low': return 'text-green-600 bg-green-100 dark:bg-green-900/30';
      default: return 'text-gray-600 bg-gray-100 dark:bg-gray-900/30';
    }
  };

  const calculateErrorRate = () => {
    if (errorTrends.length === 0) return { current: 0, previous: 0, trend: 0 };
    
    const midpoint = Math.floor(errorTrends.length / 2);
    const recent = errorTrends.slice(midpoint);
    const older = errorTrends.slice(0, midpoint);
    
    const recentAvg = recent.reduce((sum, t) => sum + t.error_rate, 0) / recent.length;
    const olderAvg = older.reduce((sum, t) => sum + t.error_rate, 0) / older.length;
    
    const trend = olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0;
    
    return { current: recentAvg, previous: olderAvg, trend };
  };

  const errorRate = calculateErrorRate();
  const totalErrors = errorSummary.reduce((sum, e) => sum + e.count, 0);
  const totalAffectedUsers = new Set(errorSummary.map(e => e.affected_users)).size;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-24 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Error Analytics
        </h2>
        <div className="flex items-center gap-2">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(Number(e.target.value))}
            className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
          >
            <option value={1}>Last 24 hours</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={exportErrorData}
          >
            <Download className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
                <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              {errorRate.trend !== 0 && (
                <div className={cn(
                  "flex items-center gap-1 text-sm",
                  errorRate.trend > 0 ? "text-red-600" : "text-green-600"
                )}>
                  {errorRate.trend > 0 ? (
                    <TrendingUp className="w-4 h-4" />
                  ) : (
                    <TrendingDown className="w-4 h-4" />
                  )}
                  {Math.abs(errorRate.trend).toFixed(1)}%
                </div>
              )}
            </div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {totalErrors.toLocaleString()}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Total Errors
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Activity className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {errorRate.current.toFixed(2)}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Errors per Hour
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <Users className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {totalAffectedUsers}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Affected Users
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Error List */}
      <Card>
        <CardHeader>
          <CardTitle>Error Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                    Error Type
                  </th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                    Count
                  </th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                    Severity
                  </th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                    Users
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                    Last Seen
                  </th>
                </tr>
              </thead>
              <tbody>
                {errorSummary.map((error, index) => (
                  <tr 
                    key={index}
                    className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                    onClick={() => fetchErrorDetails(error.error_type)}
                  >
                    <td className="py-3 px-4">
                      <div className="font-medium text-gray-900 dark:text-gray-100">
                        {error.error_type}
                      </div>
                    </td>
                    <td className="text-center py-3 px-4">
                      <span className="text-gray-700 dark:text-gray-300">
                        {error.count}
                      </span>
                    </td>
                    <td className="text-center py-3 px-4">
                      <Badge 
                        variant="secondary" 
                        size="sm"
                        className={getSeverityColor(error.severity)}
                      >
                        {error.severity}
                      </Badge>
                    </td>
                    <td className="text-center py-3 px-4">
                      <span className="text-gray-700 dark:text-gray-300">
                        {error.affected_users}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <Clock className="w-4 h-4" />
                        {new Date(error.last_seen).toRelativeTime()}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Error Details Modal */}
      {selectedError && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Error Details</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedError(null)}
                >
                  ×
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Error Information</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Type:</span>
                    <span className="font-mono">{selectedError.error.type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Message:</span>
                    <span>{selectedError.error.message}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Severity:</span>
                    <Badge 
                      variant="secondary" 
                      size="sm"
                      className={getSeverityColor(selectedError.error.severity)}
                    >
                      {selectedError.error.severity}
                    </Badge>
                  </div>
                </div>
              </div>

              {selectedError.error.stack_trace && (
                <div>
                  <h4 className="font-medium mb-2">Stack Trace</h4>
                  <pre className="p-4 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto text-xs">
                    {selectedError.error.stack_trace}
                  </pre>
                </div>
              )}

              {selectedError.feedback.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">User Feedback</h4>
                  <div className="space-y-2">
                    {selectedError.feedback.map((fb, index) => (
                      <div key={index} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <p className="text-sm">{fb.feedback}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(fb.created_at).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

// Helper to add relative time formatting
declare global {
  interface Date {
    toRelativeTime(): string;
  }
}

Date.prototype.toRelativeTime = function() {
  const now = new Date();
  const diff = now.getTime() - this.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
};