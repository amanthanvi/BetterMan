import { errorTracker } from './errorTracking';

interface OfflineQueueItem {
  id: string;
  timestamp: number;
  type: 'api' | 'analytics' | 'error';
  method: string;
  url: string;
  data?: any;
  headers?: Record<string, string>;
  retryCount: number;
  maxRetries: number;
}

interface OfflineState {
  isOnline: boolean;
  lastOnlineTime?: number;
  lastOfflineTime?: number;
  connectionQuality: 'good' | 'moderate' | 'poor' | 'offline';
}

class OfflineService {
  private static instance: OfflineService;
  private queue: OfflineQueueItem[] = [];
  private state: OfflineState = {
    isOnline: navigator.onLine,
    connectionQuality: navigator.onLine ? 'good' : 'offline',
  };
  private listeners: Set<(state: OfflineState) => void> = new Set();
  private syncTimer?: NodeJS.Timeout;
  private connectionCheckTimer?: NodeJS.Timeout;

  private constructor() {
    this.initializeService();
  }

  static getInstance(): OfflineService {
    if (!OfflineService.instance) {
      OfflineService.instance = new OfflineService();
    }
    return OfflineService.instance;
  }

  private initializeService() {
    // Load persisted queue
    this.loadQueue();

    // Set up event listeners
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);

    // Check connection quality periodically
    this.startConnectionQualityCheck();

    // Start sync if online
    if (this.state.isOnline) {
      this.startSync();
    }

    // Service worker registration for background sync
    this.registerServiceWorker();
  }

  private handleOnline = () => {
    const previousState = { ...this.state };
    this.state.isOnline = true;
    this.state.lastOnlineTime = Date.now();
    this.state.connectionQuality = 'good';

    // Notify listeners
    this.notifyListeners();

    // Log recovery
    const offlineDuration = this.state.lastOfflineTime 
      ? Date.now() - this.state.lastOfflineTime 
      : 0;
    
    errorTracker.trackMessage(
      `Connection restored after ${Math.round(offlineDuration / 1000)}s`,
      'info',
      { action: 'connectionRestored' }
    );

    // Start syncing queued requests
    this.startSync();
  };

  private handleOffline = () => {
    this.state.isOnline = false;
    this.state.lastOfflineTime = Date.now();
    this.state.connectionQuality = 'offline';

    // Notify listeners
    this.notifyListeners();

    // Stop sync
    this.stopSync();

    // Log offline event
    errorTracker.trackMessage(
      'Connection lost',
      'warning',
      { action: 'connectionLost' }
    );
  };

  private async checkConnectionQuality() {
    if (!this.state.isOnline) return;

    try {
      const start = performance.now();
      const response = await fetch('/api/health', {
        method: 'HEAD',
        cache: 'no-cache',
      });
      const latency = performance.now() - start;

      if (response.ok) {
        if (latency < 200) {
          this.state.connectionQuality = 'good';
        } else if (latency < 500) {
          this.state.connectionQuality = 'moderate';
        } else {
          this.state.connectionQuality = 'poor';
        }
      }
    } catch (error) {
      this.state.connectionQuality = 'poor';
    }

    this.notifyListeners();
  }

  private startConnectionQualityCheck() {
    this.connectionCheckTimer = setInterval(() => {
      this.checkConnectionQuality();
    }, 30000); // Check every 30 seconds
  }

  private async registerServiceWorker() {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('Service Worker registered for offline sync');
      } catch (error) {
        console.error('Service Worker registration failed:', error);
      }
    }
  }

  // Public API

  isOnline(): boolean {
    return this.state.isOnline;
  }

  getState(): OfflineState {
    return { ...this.state };
  }

  subscribe(listener: (state: OfflineState) => void): () => void {
    this.listeners.add(listener);
    // Return unsubscribe function
    return () => this.listeners.delete(listener);
  }

  async queueRequest(
    url: string,
    options: RequestInit = {},
    metadata: {
      type?: 'api' | 'analytics' | 'error';
      maxRetries?: number;
    } = {}
  ): Promise<void> {
    const item: OfflineQueueItem = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      type: metadata.type || 'api',
      method: options.method || 'GET',
      url,
      data: options.body,
      headers: options.headers as Record<string, string>,
      retryCount: 0,
      maxRetries: metadata.maxRetries || 3,
    };

    this.queue.push(item);
    this.persistQueue();

    // Try to sync immediately if online
    if (this.state.isOnline) {
      this.syncItem(item);
    }
  }

  async syncNow(): Promise<{
    successful: number;
    failed: number;
    remaining: number;
  }> {
    if (!this.state.isOnline) {
      return {
        successful: 0,
        failed: 0,
        remaining: this.queue.length,
      };
    }

    const results = {
      successful: 0,
      failed: 0,
      remaining: 0,
    };

    const itemsToSync = [...this.queue];
    
    for (const item of itemsToSync) {
      const success = await this.syncItem(item);
      if (success) {
        results.successful++;
      } else {
        results.failed++;
      }
    }

    results.remaining = this.queue.length;
    return results;
  }

  clearQueue(): void {
    this.queue = [];
    this.persistQueue();
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  getQueueItems(): OfflineQueueItem[] {
    return [...this.queue];
  }

  // Private methods

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.getState()));
  }

  private async syncItem(item: OfflineQueueItem): Promise<boolean> {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.data,
      });

      if (response.ok || response.status < 500) {
        // Success or client error - remove from queue
        this.removeFromQueue(item.id);
        return true;
      } else {
        // Server error - retry later
        return this.handleSyncError(item);
      }
    } catch (error) {
      return this.handleSyncError(item);
    }
  }

  private handleSyncError(item: OfflineQueueItem): boolean {
    item.retryCount++;

    if (item.retryCount >= item.maxRetries) {
      // Max retries reached - remove from queue
      this.removeFromQueue(item.id);
      
      errorTracker.trackError(
        new Error(`Failed to sync offline request after ${item.maxRetries} attempts`),
        {
          action: 'offlineSync',
          metadata: {
            url: item.url,
            type: item.type,
          },
        }
      );
      
      return false;
    }

    // Keep in queue for retry
    this.persistQueue();
    return false;
  }

  private removeFromQueue(id: string) {
    this.queue = this.queue.filter(item => item.id !== id);
    this.persistQueue();
  }

  private startSync() {
    if (this.syncTimer) return;

    // Initial sync
    this.syncNow();

    // Periodic sync
    this.syncTimer = setInterval(() => {
      if (this.queue.length > 0) {
        this.syncNow();
      }
    }, 30000); // Every 30 seconds
  }

  private stopSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = undefined;
    }
  }

  private persistQueue() {
    try {
      localStorage.setItem('offlineQueue', JSON.stringify(this.queue));
    } catch (error) {
      console.error('Failed to persist offline queue:', error);
    }
  }

  private loadQueue() {
    try {
      const stored = localStorage.getItem('offlineQueue');
      if (stored) {
        this.queue = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load offline queue:', error);
      this.queue = [];
    }
  }

  destroy() {
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }
    
    if (this.connectionCheckTimer) {
      clearInterval(this.connectionCheckTimer);
    }
    
    this.listeners.clear();
  }
}

// Export singleton instance
export const offlineService = OfflineService.getInstance();

// React hook for offline state
import { useEffect, useState } from 'react';

export function useOfflineState() {
  const [state, setState] = useState(offlineService.getState());

  useEffect(() => {
    const unsubscribe = offlineService.subscribe(setState);
    return unsubscribe;
  }, []);

  return state;
}

// Higher-order component for offline-aware components
export function withOfflineSupport<P extends object>(
  Component: React.ComponentType<P & { offlineState: OfflineState }>,
  options?: {
    showOfflineIndicator?: boolean;
    fallbackComponent?: React.ComponentType<P>;
  }
) {
  return (props: P) => {
    const offlineState = useOfflineState();

    if (!offlineState.isOnline && options?.fallbackComponent) {
      const FallbackComponent = options.fallbackComponent;
      return <FallbackComponent {...props} />;
    }

    return <Component {...props} offlineState={offlineState} />;
  };
}