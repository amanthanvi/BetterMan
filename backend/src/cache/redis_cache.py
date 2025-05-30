"""
Redis caching layer for improved performance.
"""

import json
import logging
from typing import Any, Optional, Dict
from datetime import timedelta
import redis
from redis.exceptions import RedisError

from ..config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class RedisCache:
    """Redis caching implementation."""
    
    def __init__(self, host: str = "localhost", port: int = 6379, db: int = 0):
        """
        Initialize Redis connection.
        
        Args:
            host: Redis host
            port: Redis port
            db: Redis database number
        """
        self.redis_url = f"redis://{host}:{port}/{db}"
        self._client = None
        
    @property
    def client(self):
        """Get Redis client with lazy initialization."""
        if self._client is None:
            try:
                self._client = redis.from_url(
                    self.redis_url,
                    decode_responses=True,
                    socket_connect_timeout=5,
                    socket_timeout=5
                )
                # Test connection
                self._client.ping()
                logger.info("Redis connection established")
            except RedisError as e:
                logger.warning(f"Redis connection failed: {e}")
                # Return None to fallback to no caching
                return None
        return self._client
    
    def get(self, key: str) -> Optional[Any]:
        """
        Get value from cache.
        
        Args:
            key: Cache key
            
        Returns:
            Cached value or None
        """
        if not self.client:
            return None
            
        try:
            value = self.client.get(key)
            if value:
                return json.loads(value)
            return None
        except (RedisError, json.JSONDecodeError) as e:
            logger.error(f"Redis get error for key {key}: {e}")
            return None
    
    def set(
        self, 
        key: str, 
        value: Any, 
        expire: Optional[int] = None
    ) -> bool:
        """
        Set value in cache.
        
        Args:
            key: Cache key
            value: Value to cache
            expire: Expiration time in seconds
            
        Returns:
            True if successful
        """
        if not self.client:
            return False
            
        try:
            serialized = json.dumps(value)
            if expire:
                return bool(self.client.setex(key, expire, serialized))
            else:
                return bool(self.client.set(key, serialized))
        except (RedisError, json.JSONEncodeError) as e:
            logger.error(f"Redis set error for key {key}: {e}")
            return False
    
    def delete(self, key: str) -> bool:
        """
        Delete value from cache.
        
        Args:
            key: Cache key
            
        Returns:
            True if deleted
        """
        if not self.client:
            return False
            
        try:
            return bool(self.client.delete(key))
        except RedisError as e:
            logger.error(f"Redis delete error for key {key}: {e}")
            return False
    
    def exists(self, key: str) -> bool:
        """
        Check if key exists in cache.
        
        Args:
            key: Cache key
            
        Returns:
            True if exists
        """
        if not self.client:
            return False
            
        try:
            return bool(self.client.exists(key))
        except RedisError as e:
            logger.error(f"Redis exists error for key {key}: {e}")
            return False
    
    def clear_pattern(self, pattern: str) -> int:
        """
        Clear all keys matching pattern.
        
        Args:
            pattern: Key pattern (e.g., "search:*")
            
        Returns:
            Number of keys deleted
        """
        if not self.client:
            return 0
            
        try:
            keys = self.client.keys(pattern)
            if keys:
                return self.client.delete(*keys)
            return 0
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


class CacheKeys:
    """Cache key generation utilities."""
    
    @staticmethod
    def search_results(query: str, section: Optional[int] = None, page: int = 1) -> str:
        """Generate cache key for search results."""
        section_part = f":{section}" if section else ""
        return f"search:{query}{section_part}:page:{page}"
    
    @staticmethod
    def document(name: str, section: Optional[int] = None) -> str:
        """Generate cache key for document."""
        section_part = f":{section}" if section else ""
        return f"doc:{name}{section_part}"
    
    @staticmethod
    def document_list(category: Optional[str] = None, section: Optional[int] = None) -> str:
        """Generate cache key for document list."""
        parts = ["docs"]
        if category:
            parts.append(f"cat:{category}")
        if section:
            parts.append(f"sec:{section}")
        return ":".join(parts)
    
    @staticmethod
    def stats(stat_type: str) -> str:
        """Generate cache key for statistics."""
        return f"stats:{stat_type}"


# Global cache instance
_redis_cache = None


def get_redis_cache() -> RedisCache:
    """Get global Redis cache instance."""
    global _redis_cache
    if _redis_cache is None:
        # Get Redis configuration from environment
        redis_host = settings.REDIS_HOST if hasattr(settings, 'REDIS_HOST') else "redis"
        redis_port = settings.REDIS_PORT if hasattr(settings, 'REDIS_PORT') else 6379
        redis_db = settings.REDIS_DB if hasattr(settings, 'REDIS_DB') else 0
        
        _redis_cache = RedisCache(redis_host, redis_port, redis_db)
    return _redis_cache