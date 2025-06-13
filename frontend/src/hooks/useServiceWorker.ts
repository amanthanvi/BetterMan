import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/stores/appStore';

interface ServiceWorkerState {
  isSupported: boolean;
  isRegistered: boolean;
  isOnline: boolean;
  registration: ServiceWorkerRegistration | null;
  updateAvailable: boolean;
  offlineReady: boolean;
}

export function useServiceWorker() {
  const { addToast } = useAppStore();
  const [state, setState] = useState<ServiceWorkerState>({
    isSupported: false,
    isRegistered: false,
    isOnline: navigator.onLine,
    registration: null,
    updateAvailable: false,
    offlineReady: false,
  });

  // Check if service workers are supported
  useEffect(() => {
    const isSupported = 'serviceWorker' in navigator;
    setState(prev => ({ ...prev, isSupported }));
  }, []);

  // Register service worker
  useEffect(() => {
    if (!state.isSupported || import.meta.env.DEV) {
      return;
    }

    let registration: ServiceWorkerRegistration;

    const registerServiceWorker = async () => {
      try {
        registration = await navigator.serviceWorker.register('/service-worker.js', {
          scope: '/',
        });

        setState(prev => ({ 
          ...prev, 
          isRegistered: true, 
          registration 
        }));

        // Check for updates periodically
        setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000); // Check every hour

        // Handle updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'activated') {
                setState(prev => ({ ...prev, updateAvailable: true }));
                addToast({
                  id: 'sw-update',
                  type: 'info',
                  message: 'A new version is available!',
                  action: {
                    label: 'Refresh',
                    onClick: () => window.location.reload(),
                  },
                });
              }
            });
          }
        });

        // Handle controller change
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          window.location.reload();
        });

        // Check if offline ready
        if (registration.active) {
          setState(prev => ({ ...prev, offlineReady: true }));
        }

      } catch (error) {
        console.error('Service worker registration failed:', error);
        addToast({
          id: 'sw-error',
          type: 'error',
          message: 'Failed to enable offline support',
        });
      }
    };

    registerServiceWorker();

    return () => {
      if (registration) {
        // Don't unregister, just clean up listeners
      }
    };
  }, [state.isSupported, addToast]);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setState(prev => ({ ...prev, isOnline: true }));
      addToast({
        id: 'online',
        type: 'success',
        message: 'Back online!',
        duration: 3000,
      });
    };

    const handleOffline = () => {
      setState(prev => ({ ...prev, isOnline: false }));
      addToast({
        id: 'offline',
        type: 'warning',
        message: 'You are offline. Some features may be limited.',
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [addToast]);

  // Skip waiting and activate new service worker
  const skipWaiting = useCallback(() => {
    if (state.registration?.waiting) {
      state.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  }, [state.registration]);

  // Clear all caches
  const clearCache = useCallback(async () => {
    if (state.registration?.active) {
      state.registration.active.postMessage({ type: 'CLEAR_CACHE' });
      addToast({
        id: 'cache-cleared',
        type: 'success',
        message: 'Cache cleared successfully',
      });
    }
  }, [state.registration, addToast]);

  // Cache specific document for offline reading
  const cacheDocument = useCallback(async (documentId: string) => {
    if (state.registration?.active) {
      state.registration.active.postMessage({ 
        type: 'CACHE_DOCUMENT',
        documentId 
      });
    }
  }, [state.registration]);

  // Request background sync
  const requestSync = useCallback(async (tag: string) => {
    if (state.registration && 'sync' in state.registration) {
      try {
        await (state.registration as any).sync.register(tag);
      } catch (error) {
        console.error('Background sync failed:', error);
      }
    }
  }, [state.registration]);

  return {
    ...state,
    skipWaiting,
    clearCache,
    cacheDocument,
    requestSync,
  };
}