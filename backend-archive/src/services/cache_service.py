"""
Cache service for managing multi-layer caching.
"""

from typing import Optional, Any, Dict, List, Callable
from datetime import datetime, timedelta
import json
import hashlib
import logging
from functools import wraps

from .base import BaseService
from ..cache.redis_cache import RedisCache
from ..models.document import Document


class CacheService(BaseService):
    """Service for cache management with multi-layer strategy."""
    
    # Cache TTLs in seconds
    TTL_PERMANENT = 86400 * 7  # 7 days for permanent content
    TTL_FREQUENT = 3600        # 1 hour for frequently accessed
    TTL_DEFAULT = 300          # 5 minutes default
    TTL_SEARCH = 60           # 1 minute for search results
    
    def __init__(self, redis_url: Optional[str] = None):
        """
        Initialize cache service.
        
        Args:
            redis_url: Optional Redis connection URL
        """
        self.logger = logging.getLogger(__name__)
        self.redis_cache = None
        self.memory_cache: Dict[str, Dict[str, Any]] = {}
        self.cache_stats = {
            'hits': 0,
            'misses': 0,
            'memory_hits': 0,
            'redis_hits': 0
        }
        
        # Initialize Redis if available
        if redis_url:
            try:
                self.redis_cache = RedisCache(redis_url)
                self.logger.info("Redis cache initialized")
            except Exception as e:
                self.logger.warning(f"Redis cache unavailable: {e}")
    
    def _generate_key(self, prefix: str, *args, **kwargs) -> str:
        """Generate cache key from prefix and arguments."""
        key_data = f"{prefix}:{':'.join(str(arg) for arg in args)}"
        if kwargs:
            key_data += f":{json.dumps(kwargs, sort_keys=True)}"
        return hashlib.md5(key_data.encode()).hexdigest()
    
    def get(self, key: str) -> Optional[Any]:
        """
        Get value from cache (memory first, then Redis).
        
        Args:
            key: Cache key
            
        Returns:
            Cached value or None
        """
        # Check memory cache first
        if key in self.memory_cache:
            entry = self.memory_cache[key]
            if entry['expires'] > datetime.utcnow():
                self.cache_stats['hits'] += 1
                self.cache_stats['memory_hits'] += 1
                return entry['value']
            else:
                # Expired
                del self.memory_cache[key]
        
        # Check Redis cache
        if self.redis_cache:
            try:
                value = self.redis_cache.get(key)
                if value is not None:
                    self.cache_stats['hits'] += 1
                    self.cache_stats['redis_hits'] += 1
                    # Store in memory cache for faster access
                    self._set_memory(key, value, self.TTL_DEFAULT)
                    return value
            except Exception as e:
                self.logger.error(f"Redis get error: {e}")
        
        self.cache_stats['misses'] += 1
        return None
    
    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """
        Set value in cache (both layers).
        
        Args:
            key: Cache key
            value: Value to cache
            ttl: Time to live in seconds
            
        Returns:
            Success status
        """
        ttl = ttl or self.TTL_DEFAULT
        
        # Set in memory cache
        self._set_memory(key, value, ttl)
        
        # Set in Redis cache
        if self.redis_cache:
            try:
                return self.redis_cache.set(key, value, expire=ttl)
            except Exception as e:
                self.logger.error(f"Redis set error: {e}")
        
        return True
    
    def _set_memory(self, key: str, value: Any, ttl: int):
        """Set value in memory cache."""
        self.memory_cache[key] = {
            'value': value,
            'expires': datetime.utcnow() + timedelta(seconds=ttl)
        }
        
        # Implement simple LRU eviction if cache is too large
        if len(self.memory_cache) > 1000:
            self._evict_memory_cache()
    
    def _evict_memory_cache(self):
        """Evict expired and oldest entries from memory cache."""
        now = datetime.utcnow()
        
        # Remove expired entries
        expired_keys = [
            k for k, v in self.memory_cache.items()
            if v['expires'] <= now
        ]
        for key in expired_keys:
            del self.memory_cache[key]
        
        # If still too large, remove oldest 20%
        if len(self.memory_cache) > 800:
            sorted_keys = sorted(
                self.memory_cache.keys(),
                key=lambda k: self.memory_cache[k]['expires']
            )
            for key in sorted_keys[:200]:
                del self.memory_cache[key]
    
    def delete(self, key: str) -> bool:
        """
        Delete value from cache.
        
        Args:
            key: Cache key
            
        Returns:
            Success status
        """
        # Remove from memory cache
        if key in self.memory_cache:
            del self.memory_cache[key]
        
        # Remove from Redis cache
        if self.redis_cache:
            try:
                return self.redis_cache.delete(key)
            except Exception as e:
                self.logger.error(f"Redis delete error: {e}")
        
        return True
    
    def invalidate_pattern(self, pattern: str) -> int:
        """
        Invalidate all keys matching pattern.
        
        Args:
            pattern: Key pattern (e.g., "doc:*")
            
        Returns:
            Number of keys invalidated
        """
        count = 0
        
        # Invalidate memory cache
        keys_to_delete = [
            k for k in self.memory_cache.keys()
            if pattern.replace('*', '') in k
        ]
        for key in keys_to_delete:
            del self.memory_cache[key]
            count += 1
        
        # Invalidate Redis cache
        if self.redis_cache:
            try:
                redis_count = self.redis_cache.delete_pattern(pattern)
                count += redis_count
            except Exception as e:
                self.logger.error(f"Redis pattern delete error: {e}")
        
        return count
    
    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        stats = self.cache_stats.copy()
        stats['memory_size'] = len(self.memory_cache)
        stats['hit_rate'] = (
            stats['hits'] / (stats['hits'] + stats['misses'])
            if (stats['hits'] + stats['misses']) > 0
            else 0
        )
        
        if self.redis_cache:
            try:
                stats['redis_info'] = self.redis_cache.info()
            except:
                stats['redis_info'] = None
        
        return stats
    
    def clear_all(self) -> bool:
        """Clear all caches."""
        self.memory_cache.clear()
        
        if self.redis_cache:
            try:
                self.redis_cache.flushdb()
            except Exception as e:
                self.logger.error(f"Redis flush error: {e}")
                return False
        
        return True
    
    def cached(self, prefix: str, ttl: Optional[int] = None):
        """
        Decorator for caching function results.
        
        Args:
            prefix: Cache key prefix
            ttl: Time to live in seconds
            
        Returns:
            Decorated function
        """
        def decorator(func: Callable):
            @wraps(func)
            def wrapper(*args, **kwargs):
                # Generate cache key
                cache_key = self._generate_key(prefix, *args, **kwargs)
                
                # Try to get from cache
                cached_value = self.get(cache_key)
                if cached_value is not None:
                    return cached_value
                
                # Call function
                result = func(*args, **kwargs)
                
                # Cache result
                self.set(cache_key, result, ttl)
                
                return result
            
            return wrapper
        return decorator