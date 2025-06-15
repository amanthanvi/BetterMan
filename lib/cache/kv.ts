import { kv } from '@vercel/kv'

interface CacheOptions {
  ttl?: number // Time to live in seconds
  tags?: string[]
}

/**
 * Vercel KV Cache wrapper
 * Falls back to in-memory cache in development
 */
class CacheClient {
  private memoryCache = new Map<string, { value: any; expires: number }>()
  
  async get<T>(key: string): Promise<T | null> {
    try {
      if (process.env.NODE_ENV === 'development') {
        const cached = this.memoryCache.get(key)
        if (cached && cached.expires > Date.now()) {
          return cached.value
        }
        this.memoryCache.delete(key)
        return null
      }
      
      return await kv.get<T>(key)
    } catch (error) {
      console.error('Cache get error:', error)
      return null
    }
  }
  
  async set(key: string, value: any, options?: CacheOptions): Promise<void> {
    try {
      const ttl = options?.ttl || 3600 // Default 1 hour
      
      if (process.env.NODE_ENV === 'development') {
        this.memoryCache.set(key, {
          value,
          expires: Date.now() + (ttl * 1000)
        })
        return
      }
      
      await kv.set(key, value, { ex: ttl })
      
      // Set tags for invalidation
      if (options?.tags) {
        for (const tag of options.tags) {
          await kv.sadd(`tag:${tag}`, key)
          await kv.expire(`tag:${tag}`, ttl)
        }
      }
    } catch (error) {
      console.error('Cache set error:', error)
    }
  }
  
  async delete(key: string): Promise<void> {
    try {
      if (process.env.NODE_ENV === 'development') {
        this.memoryCache.delete(key)
        return
      }
      
      await kv.del(key)
    } catch (error) {
      console.error('Cache delete error:', error)
    }
  }
  
  async invalidateTag(tag: string): Promise<void> {
    try {
      if (process.env.NODE_ENV === 'development') {
        // In development, clear all cache
        this.memoryCache.clear()
        return
      }
      
      const keys = await kv.smembers(`tag:${tag}`)
      if (keys.length > 0) {
        await kv.del(...keys)
        await kv.del(`tag:${tag}`)
      }
    } catch (error) {
      console.error('Cache invalidate tag error:', error)
    }
  }
  
  /**
   * Get or set cache with factory function
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options?: CacheOptions
  ): Promise<T> {
    const cached = await this.get<T>(key)
    if (cached !== null) {
      return cached
    }
    
    const value = await factory()
    await this.set(key, value, options)
    return value
  }
}

export const cache = new CacheClient()

// Cache key helpers
export const cacheKeys = {
  document: (name: string, section?: number) => 
    `doc:${name}${section ? `:${section}` : ''}`,
  
  search: (query: string, options?: any) => 
    `search:${query}:${JSON.stringify(options || {})}`,
  
  suggestions: (prefix: string) => 
    `suggest:${prefix}`,
  
  popular: (limit: number) => 
    `popular:${limit}`,
  
  userHistory: (userId: string, limit: number) => 
    `history:${userId}:${limit}`,
}