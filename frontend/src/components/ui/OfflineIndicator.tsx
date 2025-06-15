import React from 'react';
import { WifiOff, WifiIcon } from 'lucide-react';
import { cn } from '@/utils/cn';

interface OfflineIndicatorProps {
  isOnline: boolean;
  className?: string;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({ 
  isOnline, 
  className 
}) => {
  return (
    <>
      {!isOnline && (
        <div}}}}
          className={cn(
            'fixed top-16 left-1/2 transform -translate-x-1/2 z-50',
            'bg-yellow-500 text-white px-4 py-2 rounded-lg shadow-lg',
            'flex items-center gap-2',
            className
          )}
        >
          <WifiOff className="w-4 h-4" />
          <span className="text-sm font-medium">You're offline</span>
        </div>
      )}
    </>
  );
};

export const OfflineBadge: React.FC<{ isOnline: boolean }> = ({ isOnline }) => {
  if (isOnline) {
    return null;
  }

  return (
    <div className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 rounded text-xs">
      <WifiOff className="w-3 h-3" />
      <span>Offline</span>
    </div>
  );
};

export const ConnectionStatus: React.FC<{ 
  isOnline: boolean;
  offlineReady: boolean;
}> = ({ isOnline, offlineReady }) => {
  return (
    <div className="flex items-center gap-2 text-sm">
      {isOnline ? (
        <>
          <WifiIcon className="w-4 h-4 text-green-500" />
          <span className="text-gray-600 dark:text-gray-400">Online</span>
        </>
      ) : (
        <>
          <WifiOff className="w-4 h-4 text-yellow-500" />
          <span className="text-gray-600 dark:text-gray-400">
            Offline {offlineReady && '(cached content available)'}
          </span>
        </>
      )}
    </div>
  );
};