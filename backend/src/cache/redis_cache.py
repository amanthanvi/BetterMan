"""
Enhanced Redis caching layer with advanced features.
"""

import json
import logging
import pickle
from typing import Any, Optional, Dict, List, Callable, Union
from datetime import timedelta
import redis
from redis.exceptions import RedisError
from functools import wraps
import hashlib
import time

from ..config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class RedisCache:
    """Enhanced Redis caching implementation with advanced features."""
    
    def __init__(
        self,
        host: str = "localhost",
        port: int = 6379,
        db: int = 0,
        password: Optional[str] = None,
        pool_size: int = 10,
        decode_responses: bool = True
    ):
        """
        Initialize Redis connection with connection pooling.
        
        Args:
            host: Redis host
            port: Redis port
            db: Redis database number
            password: Redis password (optional)
            pool_size: Connection pool size
            decode_responses: Whether to decode responses as strings
        """
        self.pool = redis.ConnectionPool(
            host=host,
            port=port,
            db=db,
            password=password,
            max_connections=pool_size,
            decode_responses=decode_responses,
            socket_connect_timeout=5,
            socket_timeout=5,
            socket_keepalive=True,
            health_check_interval=30
        )
        self._client = None
        self._pipeline = None
        
    @property
    def client(self) -> Optional[redis.Redis]:
        """Get Redis client with lazy initialization."""
        if self._client is None:
            try:
                self._client = redis.Redis(connection_pool=self.pool)
                # Test connection
                self._client.ping()
                logger.info("Redis connection established")
            except RedisError as e:
                logger.warning(f"Redis connection failed: {e}")
                return None
        return self._client
    
    def get(self, key: str, default: Any = None) -> Optional[Any]:
        """
        Get value from cache with optional default.
        
        Args:
            key: Cache key
            default: Default value if not found
            
        Returns:
            Cached value or default
        """
        if not self.client:
            return default
            
        try:
            value = self.client.get(key)
            if value:
                # Try JSON first, fall back to pickle
                try:
                    return json.loads(value)
                except json.JSONDecodeError:
                    return pickle.loads(value.encode('latin-1') if isinstance(value, str) else value)
            return default
        except (RedisError, Exception) as e:
            logger.error(f"Redis get error for key {key}: {e}")
            return default
    
    def set(
        self,
        key: str,
        value: Any,
        expire: Optional[int] = None,
        nx: bool = False,
        xx: bool = False
    ) -> bool:
        """
        Set value in cache with advanced options.
        
        Args:
            key: Cache key
            value: Value to cache
            expire: Expiration time in seconds
            nx: Only set if key doesn't exist
            xx: Only set if key exists
            
        Returns:
            True if successful
        """
        if not self.client:
            return False
            
        try:
            # Try JSON serialization first, fall back to pickle
            try:
                serialized = json.dumps(value)
            except (TypeError, ValueError):
                serialized = pickle.dumps(value).decode('latin-1')
            
            return bool(self.client.set(
                key,
                serialized,
                ex=expire,
                nx=nx,
                xx=xx
            ))
        except (RedisError, Exception) as e:
            logger.error(f"Redis set error for key {key}: {e}")
            return False
    
    def mget(self, keys: List[str]) -> Dict[str, Any]:
        """
        Get multiple values at once.
        
        Args:
            keys: List of cache keys
            
        Returns:
            Dict of key-value pairs
        """
        if not self.client or not keys:
            return {}
            
        try:
            values = self.client.mget(keys)
            result = {}
            for key, value in zip(keys, values):
                if value:
                    try:
                        result[key] = json.loads(value)
                    except json.JSONDecodeError:
                        result[key] = pickle.loads(value.encode('latin-1') if isinstance(value, str) else value)
            return result
        except (RedisError, Exception) as e:
            logger.error(f"Redis mget error: {e}")
            return {}
    
    def mset(self, mapping: Dict[str, Any], expire: Optional[int] = None) -> bool:
        """
        Set multiple values at once.
        
        Args:
            mapping: Dict of key-value pairs
            expire: Expiration time in seconds
            
        Returns:
            True if successful
        """
        if not self.client or not mapping:
            return False
            
        try:
            # Serialize values
            serialized = {}
            for key, value in mapping.items():
                try:
                    serialized[key] = json.dumps(value)
                except (TypeError, ValueError):
                    serialized[key] = pickle.dumps(value).decode('latin-1')
            
            # Use pipeline for atomic operation
            with self.client.pipeline() as pipe:
                pipe.mset(serialized)
                if expire:
                    for key in serialized:
                        pipe.expire(key, expire)
                pipe.execute()
            return True
        except (RedisError, Exception) as e:
            logger.error(f"Redis mset error: {e}")
            return False
    
    def delete(self, *keys: str) -> int:
        """
        Delete one or more keys.
        
        Args:
            keys: Cache keys to delete
            
        Returns:
            Number of keys deleted
        """
        if not self.client or not keys:
            return 0
            
        try:
            return self.client.delete(*keys)
        except RedisError as e:
            logger.error(f"Redis delete error: {e}")
            return 0
    
    def exists(self, *keys: str) -> int:
        """
        Check how many keys exist.
        
        Args:
            keys: Cache keys to check
            
        Returns:
            Number of existing keys
        """
        if not self.client or not keys:
            return 0
            
        try:
            return self.client.exists(*keys)
        except RedisError as e:
            logger.error(f"Redis exists error: {e}")
            return 0
    
    def increment(self, key: str, amount: int = 1, ttl: Optional[int] = None) -> Optional[int]:
        """
        Increment a counter atomically.
        
        Args:
            key: Counter key
            amount: Amount to increment
            ttl: Optional TTL to set
            
        Returns:
            New value or None if error
        """
        if not self.client:
            return None
            
        try:
            with self.client.pipeline() as pipe:
                pipe.incrby(key, amount)
                if ttl:
                    pipe.expire(key, ttl)
                result = pipe.execute()
                return result[0]
        except RedisError as e:
            logger.error(f"Redis increment error for key {key}: {e}")
            return None
    
    def clear_pattern(self, pattern: str, batch_size: int = 1000) -> int:
        """
        Clear all keys matching pattern (with batching for performance).
        
        Args:
            pattern: Key pattern (e.g., "search:*")
            batch_size: Batch size for deletion
            
        Returns:
            Number of keys deleted
        """
        if not self.client:
            return 0
            
        try:
            deleted = 0
            cursor = 0
            
            while True:
                cursor, keys = self.client.scan(
                    cursor,
                    match=pattern,
                    count=batch_size
                )
                
                if keys:
                    deleted += self.client.delete(*keys)
                
                if cursor == 0:
                    break
                    
            return deleted
        except RedisError as e:
            logger.error(f"Redis clear pattern error for {pattern}: {e}")
            return 0
    
    def get_ttl(self, key: str) -> int:
        """
        Get time to live for key.
        
        Args:
            key: Cache key
            
        Returns:
            TTL in seconds, -1 if no expire, -2 if not exists
        """
        if not self.client:
            return -2
            
        try:
            return self.client.ttl(key)
        except RedisError as e:
            logger.error(f"Redis TTL error for key {key}: {e}")
            return -2
    
    def set_ttl(self, key: str, ttl: int) -> bool:
        """
        Set TTL for existing key.
        
        Args:
            key: Cache key
            ttl: TTL in seconds
            
        Returns:
            True if successful
        """
        if not self.client:
            return False
            
        try:
            return bool(self.client.expire(key, ttl))
        except RedisError as e:
            logger.error(f"Redis set TTL error for key {key}: {e}")
            return False
    
    def pipeline(self) -> Optional[redis.Pipeline]:
        """Get Redis pipeline for batch operations."""
        if not self.client:
            return None
        return self.client.pipeline()
    
    def health_check(self) -> Dict[str, Any]:
        """
        Perform health check on Redis connection.
        
        Returns:
            Health status dict
        """
        status = {
            "healthy": False,
            "latency_ms": None,
            "info": {}
        }
        
        if not self.client:
            status["error"] = "No client connection"
            return status
        
        try:
            # Measure ping latency
            start = time.time()
            self.client.ping()
            status["latency_ms"] = round((time.time() - start) * 1000, 2)
            
            # Get Redis info
            info = self.client.info()
            status["info"] = {
                "version": info.get("redis_version"),
                "connected_clients": info.get("connected_clients"),
                "used_memory_human": info.get("used_memory_human"),
                "uptime_days": info.get("uptime_in_days")
            }
            
            status["healthy"] = True
        except RedisError as e:
            status["error"] = str(e)
        
        return status


def cache_key_wrapper(
    prefix: str,
    expire: int = 3600,
    key_func: Optional[Callable] = None,
    condition: Optional[Callable] = None
):
    """
    Decorator for caching function results.
    
    Args:
        prefix: Cache key prefix
        expire: Expiration time in seconds
        key_func: Custom key generation function
        condition: Function to determine if result should be cached
    """
    def decorator(func):
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            # Generate cache key
            if key_func:
                cache_key = f"{prefix}:{key_func(*args, **kwargs)}"
            else:
                # Default key generation
                key_parts = [str(arg) for arg in args]
                key_parts.extend(f"{k}={v}" for k, v in sorted(kwargs.items()))
                key_hash = hashlib.md5(":".join(key_parts).encode()).hexdigest()
                cache_key = f"{prefix}:{key_hash}"
            
            # Try to get from cache
            cache = get_redis_cache()
            cached = cache.get(cache_key)
            if cached is not None:
                logger.debug(f"Cache hit for {cache_key}")
                return cached
            
            # Execute function
            result = await func(*args, **kwargs)
            
            # Cache result if condition is met
            if condition is None or condition(result):
                cache.set(cache_key, result, expire=expire)
                logger.debug(f"Cached result for {cache_key}")
            
            return result
        
        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            # Generate cache key
            if key_func:
                cache_key = f"{prefix}:{key_func(*args, **kwargs)}"
            else:
                # Default key generation
                key_parts = [str(arg) for arg in args]
                key_parts.extend(f"{k}={v}" for k, v in sorted(kwargs.items()))
                key_hash = hashlib.md5(":".join(key_parts).encode()).hexdigest()
                cache_key = f"{prefix}:{key_hash}"
            
            # Try to get from cache
            cache = get_redis_cache()
            cached = cache.get(cache_key)
            if cached is not None:
                logger.debug(f"Cache hit for {cache_key}")
                return cached
            
            # Execute function
            result = func(*args, **kwargs)
            
            # Cache result if condition is met
            if condition is None or condition(result):
                cache.set(cache_key, result, expire=expire)
                logger.debug(f"Cached result for {cache_key}")
            
            return result
        
        # Return appropriate wrapper
        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator


class CacheKeys:
    """Enhanced cache key generation utilities."""
    
    @staticmethod
    def search_results(query: str, section: Optional[int] = None, page: int = 1, filters: Optional[Dict] = None) -> str:
        """Generate cache key for search results."""
        parts = ["search", query]
        if section:
            parts.append(f"sec:{section}")
        parts.append(f"page:{page}")
        if filters:
            filter_str = ":".join(f"{k}={v}" for k, v in sorted(filters.items()))
            parts.append(f"filters:{hashlib.md5(filter_str.encode()).hexdigest()[:8]}")
        return ":".join(parts)
    
    @staticmethod
    def document(name: str, section: Optional[int] = None, version: Optional[str] = None) -> str:
        """Generate cache key for document."""
        parts = ["doc", name]
        if section:
            parts.append(f"sec:{section}")
        if version:
            parts.append(f"v:{version}")
        return ":".join(parts)
    
    @staticmethod
    def document_list(category: Optional[str] = None, section: Optional[int] = None, page: int = 1) -> str:
        """Generate cache key for document list."""
        parts = ["docs"]
        if category:
            parts.append(f"cat:{category}")
        if section:
            parts.append(f"sec:{section}")
        parts.append(f"page:{page}")
        return ":".join(parts)
    
    @staticmethod
    def user_session(user_id: int) -> str:
        """Generate cache key for user session."""
        return f"session:user:{user_id}"
    
    @staticmethod
    def api_key(key: str) -> str:
        """Generate cache key for API key."""
        return f"api_key:{key}"
    
    @staticmethod
    def rate_limit(identifier: str, window: str) -> str:
        """Generate cache key for rate limiting."""
        return f"rate_limit:{identifier}:{window}"
    
    @staticmethod
    def stats(stat_type: str, period: Optional[str] = None) -> str:
        """Generate cache key for statistics."""
        parts = ["stats", stat_type]
        if period:
            parts.append(period)
        return ":".join(parts)


# Global cache instance
_redis_cache = None


def get_redis_cache() -> RedisCache:
    """Get global Redis cache instance."""
    global _redis_cache
    if _redis_cache is None:
        # Get Redis configuration
        if hasattr(settings, 'REDIS_URL') and settings.REDIS_URL:
            # Parse Redis URL
            import urllib.parse
            parsed = urllib.parse.urlparse(settings.REDIS_URL)
            _redis_cache = RedisCache(
                host=parsed.hostname or "localhost",
                port=parsed.port or 6379,
                db=int(parsed.path[1:]) if parsed.path else 0,
                password=parsed.password
            )
        else:
            # Use individual settings
            _redis_cache = RedisCache(
                host=getattr(settings, 'REDIS_HOST', 'redis'),
                port=getattr(settings, 'REDIS_PORT', 6379),
                db=getattr(settings, 'REDIS_DB', 0),
                password=getattr(settings, 'REDIS_PASSWORD', None)
            )
    return _redis_cache