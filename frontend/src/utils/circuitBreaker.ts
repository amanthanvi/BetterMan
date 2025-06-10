interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeout: number;
  monitoringPeriod: number;
  onOpen?: () => void;
  onClose?: () => void;
  onHalfOpen?: () => void;
}

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime?: number;
  private resetTimer?: NodeJS.Timeout;
  private readonly options: CircuitBreakerOptions;

  constructor(options: Partial<CircuitBreakerOptions> = {}) {
    this.options = {
      failureThreshold: 5,
      resetTimeout: 60000, // 1 minute
      monitoringPeriod: 60000, // 1 minute
      ...options,
    };
  }

  async execute<T>(
    operation: () => Promise<T>,
    fallback?: () => T | Promise<T>
  ): Promise<T> {
    if (this.state === 'OPEN') {
      if (fallback) {
        return fallback();
      }
      throw new Error('Circuit breaker is OPEN');
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      
      if (fallback) {
        return fallback();
      }
      
      throw error;
    }
  }

  private onSuccess() {
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      
      // Close circuit after successful operations in half-open state
      if (this.successCount >= Math.ceil(this.options.failureThreshold / 2)) {
        this.close();
      }
    } else if (this.state === 'CLOSED') {
      // Reset failure count on success
      this.failureCount = 0;
    }
  }

  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      // Immediately open on failure in half-open state
      this.open();
    } else if (
      this.state === 'CLOSED' &&
      this.failureCount >= this.options.failureThreshold
    ) {
      this.open();
    }
  }

  private open() {
    this.state = 'OPEN';
    this.options.onOpen?.();

    // Schedule transition to half-open
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }

    this.resetTimer = setTimeout(() => {
      this.halfOpen();
    }, this.options.resetTimeout);
  }

  private close() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.options.onClose?.();

    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = undefined;
    }
  }

  private halfOpen() {
    this.state = 'HALF_OPEN';
    this.successCount = 0;
    this.options.onHalfOpen?.();
  }

  getState(): CircuitState {
    return this.state;
  }

  getStats() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
    };
  }

  reset() {
    this.close();
  }
}

// Service-specific circuit breakers
export const apiCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeout: 30000,
  onOpen: () => console.warn('API circuit breaker opened'),
  onClose: () => console.info('API circuit breaker closed'),
});

export const searchCircuitBreaker = new CircuitBreaker({
  failureThreshold: 3,
  resetTimeout: 20000,
  onOpen: () => console.warn('Search circuit breaker opened'),
  onClose: () => console.info('Search circuit breaker closed'),
});

// Retry with exponential backoff
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffFactor?: number;
    shouldRetry?: (error: any) => boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffFactor = 2,
    shouldRetry = () => true,
  } = options;

  let lastError: any;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error;
      }

      const delay = Math.min(
        initialDelay * Math.pow(backoffFactor, attempt),
        maxDelay
      );
      
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// Timeout wrapper
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutError = new Error('Operation timed out')
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(timeoutError), timeoutMs)
    ),
  ]);
}

// Bulk operations with partial failure handling
export async function bulkOperation<T, R>(
  items: T[],
  operation: (item: T) => Promise<R>,
  options: {
    concurrency?: number;
    continueOnError?: boolean;
    onError?: (error: any, item: T) => void;
  } = {}
): Promise<{ results: R[]; errors: Array<{ item: T; error: any }> }> {
  const {
    concurrency = 5,
    continueOnError = true,
    onError,
  } = options;

  const results: R[] = [];
  const errors: Array<{ item: T; error: any }> = [];
  
  // Process in chunks
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const promises = chunk.map(async (item) => {
      try {
        const result = await operation(item);
        results.push(result);
      } catch (error) {
        errors.push({ item, error });
        onError?.(error, item);
        
        if (!continueOnError) {
          throw error;
        }
      }
    });

    await Promise.all(promises);
  }

  return { results, errors };
}