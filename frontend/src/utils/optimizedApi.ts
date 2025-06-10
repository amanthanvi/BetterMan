import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';

// Cache configuration
interface CacheConfig {
  ttl?: number; // Time to live in milliseconds
  key?: string; // Custom cache key
  invalidateOn?: string[]; // Array of mutation endpoints that invalidate this cache
}

// Request queue for deduplication
interface QueuedRequest {
  promise: Promise<any>;
  timestamp: number;
}

// Cache storage
class CacheManager {
  private cache: Map<string, { data: any; timestamp: number; ttl: number }> = new Map();
  private requestQueue: Map<string, QueuedRequest> = new Map();

  // Get cached data
  get(key: string): any | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const now = Date.now();
    if (now - cached.timestamp > cached.ttl) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  // Set cached data
  set(key: string, data: any, ttl: number = 300000): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  // Invalidate cache by key pattern
  invalidate(pattern: string): void {
    const keysToDelete: string[] = [];
    this.cache.forEach((_, key) => {
      if (key.includes(pattern)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => this.cache.delete(key));
  }

  // Clear all cache
  clear(): void {
    this.cache.clear();
    this.requestQueue.clear();
  }

  // Get request from queue
  getQueuedRequest(key: string): Promise<any> | null {
    const queued = this.requestQueue.get(key);
    if (!queued) return null;

    // Remove old requests from queue (older than 5 seconds)
    const now = Date.now();
    if (now - queued.timestamp > 5000) {
      this.requestQueue.delete(key);
      return null;
    }

    return queued.promise;
  }

  // Add request to queue
  queueRequest(key: string, promise: Promise<any>): void {
    this.requestQueue.set(key, {
      promise,
      timestamp: Date.now(),
    });
  }

  // Remove request from queue
  dequeueRequest(key: string): void {
    this.requestQueue.delete(key);
  }
}

// Create cache manager instance
const cacheManager = new CacheManager();

// Create optimized axios instance
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for auth and caching
api.interceptors.request.use(
  (config) => {
    // Add auth token if available
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Add request ID for tracking
    config.headers['X-Request-ID'] = generateRequestId();

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling and caching
api.interceptors.response.use(
  (response) => {
    // Log performance metrics
    const duration = Date.now() - (response.config as any).startTime;
    if (duration > 1000) {
      console.warn(`Slow API call: ${response.config.url} took ${duration}ms`);
    }

    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // Retry logic for network errors
    if (!error.response && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;
      await sleep(1000); // Wait 1 second before retry
      return api(originalRequest);
    }

    // Handle 401 errors
    if (error.response?.status === 401) {
      // Clear auth and redirect to login
      localStorage.removeItem('authToken');
      window.location.href = '/login';
    }

    return Promise.reject(error);
  }
);

// Generate request ID
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Sleep utility
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Create cache key from request config
function createCacheKey(url: string, params?: any): string {
  const paramString = params ? JSON.stringify(params) : '';
  return `${url}:${paramString}`;
}

// Optimized GET request with caching and deduplication
export async function get<T = any>(
  url: string,
  config?: AxiosRequestConfig & { cache?: CacheConfig }
): Promise<T> {
  const cacheConfig = config?.cache;
  const cacheKey = cacheConfig?.key || createCacheKey(url, config?.params);

  // Check cache first
  if (cacheConfig !== false) {
    const cached = cacheManager.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  // Check if request is already in flight (deduplication)
  const queuedRequest = cacheManager.getQueuedRequest(cacheKey);
  if (queuedRequest) {
    return queuedRequest;
  }

  // Make the request
  const requestPromise = (async () => {
    try {
      const startTime = Date.now();
      const response = await api.get<T>(url, {
        ...config,
        startTime,
      } as any);

      // Cache the response
      if (cacheConfig !== false) {
        const ttl = cacheConfig?.ttl || 300000; // Default 5 minutes
        cacheManager.set(cacheKey, response.data, ttl);
      }

      return response.data;
    } finally {
      // Remove from request queue
      cacheManager.dequeueRequest(cacheKey);
    }
  })();

  // Add to request queue
  cacheManager.queueRequest(cacheKey, requestPromise);

  return requestPromise;
}

// POST request with cache invalidation
export async function post<T = any>(
  url: string,
  data?: any,
  config?: AxiosRequestConfig & { invalidateCache?: string[] }
): Promise<T> {
  const response = await api.post<T>(url, data, config);

  // Invalidate related caches
  if (config?.invalidateCache) {
    config.invalidateCache.forEach(pattern => {
      cacheManager.invalidate(pattern);
    });
  }

  return response.data;
}

// PUT request with cache invalidation
export async function put<T = any>(
  url: string,
  data?: any,
  config?: AxiosRequestConfig & { invalidateCache?: string[] }
): Promise<T> {
  const response = await api.put<T>(url, data, config);

  // Invalidate related caches
  if (config?.invalidateCache) {
    config.invalidateCache.forEach(pattern => {
      cacheManager.invalidate(pattern);
    });
  }

  return response.data;
}

// DELETE request with cache invalidation
export async function del<T = any>(
  url: string,
  config?: AxiosRequestConfig & { invalidateCache?: string[] }
): Promise<T> {
  const response = await api.delete<T>(url, config);

  // Invalidate related caches
  if (config?.invalidateCache) {
    config.invalidateCache.forEach(pattern => {
      cacheManager.invalidate(pattern);
    });
  }

  return response.data;
}

// Batch requests
export async function batch<T = any>(
  requests: Array<{
    method: 'get' | 'post' | 'put' | 'delete';
    url: string;
    data?: any;
    config?: AxiosRequestConfig;
  }>
): Promise<T[]> {
  const promises = requests.map(req => {
    switch (req.method) {
      case 'get':
        return get(req.url, req.config);
      case 'post':
        return post(req.url, req.data, req.config);
      case 'put':
        return put(req.url, req.data, req.config);
      case 'delete':
        return del(req.url, req.config);
    }
  });

  return Promise.all(promises);
}

// Prefetch data
export async function prefetch(
  url: string,
  config?: AxiosRequestConfig & { cache?: CacheConfig }
): Promise<void> {
  try {
    await get(url, config);
  } catch (error) {
    console.error('Prefetch failed:', error);
  }
}

// Clear cache
export function clearCache(pattern?: string): void {
  if (pattern) {
    cacheManager.invalidate(pattern);
  } else {
    cacheManager.clear();
  }
}

// Export cache manager for advanced usage
export { cacheManager };

// Export base axios instance
export default api;