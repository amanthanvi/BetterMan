"""Enhanced caching system with multiple layers and intelligent invalidation."""

import asyncio
import hashlib
import json
import pickle
import time
from collections import OrderedDict
from datetime import datetime, timedelta
from functools import wraps
from typing import Any, Callable, Dict, List, Optional, Set, Tuple, Union

import redis.asyncio as redis
from fastapi import Request
from sqlalchemy.orm import Session

from ..config import get_settings
from ..utils.logger import get_logger

logger = get_logger(__name__)
settings = get_settings()


class CacheStats:
    """Track cache performance metrics."""
    
    def __init__(self):
        self.hits = 0
        self.misses = 0
        self.sets = 0
        self.deletes = 0
        self.errors = 0
        self.total_hit_time = 0
        self.total_miss_time = 0
        self.start_time = time.time()
    
    @property
    def hit_rate(self) -> float:
        total = self.hits + self.misses
        return (self.hits / total * 100) if total > 0 else 0
    
    @property
    def avg_hit_time(self) -> float:
        return (self.total_hit_time / self.hits) if self.hits > 0 else 0
    
    @property
    def avg_miss_time(self) -> float:
        return (self.total_miss_time / self.misses) if self.misses > 0 else 0
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "hits": self.hits,
            "misses": self.misses,
            "hit_rate": f"{self.hit_rate:.2f}%",
            "sets": self.sets,
            "deletes": self.deletes,
            "errors": self.errors,
            "avg_hit_time_ms": f"{self.avg_hit_time * 1000:.2f}",
            "avg_miss_time_ms": f"{self.avg_miss_time * 1000:.2f}",
            "uptime_seconds": int(time.time() - self.start_time),
        }


class LRUCache:
    """Thread-safe LRU cache implementation."""
    
    def __init__(self, maxsize: int = 1000):
        self.cache: OrderedDict = OrderedDict()
        self.maxsize = maxsize
        self.lock = asyncio.Lock()
    
    async def get(self, key: str) -> Optional[Any]:
        async with self.lock:
            if key in self.cache:
                # Move to end (most recently used)
                self.cache.move_to_end(key)
                return self.cache[key]
            return None
    
    async def set(self, key: str, value: Any) -> None:
        async with self.lock:
            if key in self.cache:
                # Update existing key
                self.cache.move_to_end(key)
            else:
                # Add new key
                if len(self.cache) >= self.maxsize:
                    # Remove least recently used
                    self.cache.popitem(last=False)
            self.cache[key] = value
    
    async def delete(self, key: str) -> bool:
        async with self.lock:
            if key in self.cache:
                del self.cache[key]
                return True
            return False
    
    async def clear(self) -> None:
        async with self.lock:
            self.cache.clear()
    
    async def size(self) -> int:
        async with self.lock:
            return len(self.cache)


class EnhancedCacheManager:
    """Multi-layer cache with Redis and in-memory LRU cache."""
    
    def __init__(
        self,
        redis_client: Optional[redis.Redis] = None,
        memory_cache_size: int = 1000,
        default_ttl: int = 300,  # 5 minutes
        enable_compression: bool = True,
    ):
        self.redis_client = redis_client
        self.memory_cache = LRUCache(maxsize=memory_cache_size)
        self.default_ttl = default_ttl
        self.enable_compression = enable_compression
        self.stats = CacheStats()
        self._tag_keys: Dict[str, Set[str]] = {}  # Track keys by tags
        self._key_tags: Dict[str, Set[str]] = {}  # Track tags by keys
        self._lock = asyncio.Lock()
    
    def _generate_key(self, prefix: str, *args, **kwargs) -> str:
        """Generate a cache key from prefix and arguments."""
        key_parts = [prefix]
        
        # Add positional arguments
        for arg in args:
            if isinstance(arg, (str, int, float, bool)):
                key_parts.append(str(arg))
            else:
                # Hash complex objects
                key_parts.append(hashlib.md5(
                    json.dumps(arg, sort_keys=True).encode()
                ).hexdigest()[:8])
        
        # Add keyword arguments
        if kwargs:
            sorted_kwargs = sorted(kwargs.items())
            kwargs_str = json.dumps(sorted_kwargs)
            key_parts.append(hashlib.md5(kwargs_str.encode()).hexdigest()[:8])
        
        return ":".join(key_parts)
    
    def _serialize(self, value: Any) -> bytes:
        """Serialize value for storage."""
        data = pickle.dumps(value)
        
        if self.enable_compression and len(data) > 1024:  # Compress if > 1KB
            import zlib
            return b"Z" + zlib.compress(data)
        
        return b"P" + data
    
    def _deserialize(self, data: bytes) -> Any:
        """Deserialize value from storage."""
        if not data:
            return None
        
        marker = data[0:1]
        payload = data[1:]
        
        if marker == b"Z":
            import zlib
            payload = zlib.decompress(payload)
        
        return pickle.loads(payload)
    
    async def _add_tags(self, key: str, tags: List[str]) -> None:
        """Associate tags with a cache key."""
        async with self._lock:
            # Track tags for this key
            if key not in self._key_tags:
                self._key_tags[key] = set()
            self._key_tags[key].update(tags)
            
            # Track keys for each tag
            for tag in tags:
                if tag not in self._tag_keys:
                    self._tag_keys[tag] = set()
                self._tag_keys[tag].add(key)
    
    async def _remove_tags(self, key: str) -> None:
        """Remove tag associations for a key."""
        async with self._lock:
            if key in self._key_tags:
                # Remove key from all its tags
                for tag in self._key_tags[key]:
                    if tag in self._tag_keys:
                        self._tag_keys[tag].discard(key)
                        if not self._tag_keys[tag]:
                            del self._tag_keys[tag]
                
                # Remove tags for this key
                del self._key_tags[key]
    
    async def get(
        self,
        key: str,
        default: Any = None,
        skip_memory: bool = False,
    ) -> Optional[Any]:
        """Get value from cache (memory first, then Redis)."""
        start_time = time.time()
        
        try:
            # Check memory cache first
            if not skip_memory:
                value = await self.memory_cache.get(key)
                if value is not None:
                    self.stats.hits += 1
                    self.stats.total_hit_time += time.time() - start_time
                    return value
            
            # Check Redis
            if self.redis_client:
                try:
                    data = await self.redis_client.get(key)
                    if data:
                        value = self._deserialize(data)
                        
                        # Store in memory cache
                        if not skip_memory:
                            await self.memory_cache.set(key, value)
                        
                        self.stats.hits += 1
                        self.stats.total_hit_time += time.time() - start_time
                        return value
                except Exception as e:
                    logger.error(f"Redis get error: {e}")
                    self.stats.errors += 1
            
            self.stats.misses += 1
            self.stats.total_miss_time += time.time() - start_time
            return default
            
        except Exception as e:
            logger.error(f"Cache get error: {e}")
            self.stats.errors += 1
            return default
    
    async def set(
        self,
        key: str,
        value: Any,
        ttl: Optional[int] = None,
        tags: Optional[List[str]] = None,
        skip_memory: bool = False,
    ) -> bool:
        """Set value in cache (both memory and Redis)."""
        try:
            # Store in memory cache
            if not skip_memory:
                await self.memory_cache.set(key, value)
            
            # Store in Redis
            if self.redis_client:
                try:
                    data = self._serialize(value)
                    ttl = ttl or self.default_ttl
                    await self.redis_client.setex(key, ttl, data)
                except Exception as e:
                    logger.error(f"Redis set error: {e}")
                    self.stats.errors += 1
                    return False
            
            # Add tags if provided
            if tags:
                await self._add_tags(key, tags)
            
            self.stats.sets += 1
            return True
            
        except Exception as e:
            logger.error(f"Cache set error: {e}")
            self.stats.errors += 1
            return False
    
    async def delete(self, key: str) -> bool:
        """Delete value from cache."""
        try:
            # Remove from memory cache
            memory_deleted = await self.memory_cache.delete(key)
            
            # Remove from Redis
            redis_deleted = False
            if self.redis_client:
                try:
                    redis_deleted = await self.redis_client.delete(key) > 0
                except Exception as e:
                    logger.error(f"Redis delete error: {e}")
                    self.stats.errors += 1
            
            # Remove tags
            await self._remove_tags(key)
            
            if memory_deleted or redis_deleted:
                self.stats.deletes += 1
                return True
            
            return False
            
        except Exception as e:
            logger.error(f"Cache delete error: {e}")
            self.stats.errors += 1
            return False
    
    async def delete_pattern(self, pattern: str) -> int:
        """Delete all keys matching pattern."""
        count = 0
        
        try:
            # Clear matching keys from memory cache
            # Note: This is not efficient for memory cache, consider alternatives
            
            # Delete from Redis
            if self.redis_client:
                try:
                    cursor = 0
                    while True:
                        cursor, keys = await self.redis_client.scan(
                            cursor, match=pattern, count=100
                        )
                        if keys:
                            count += await self.redis_client.delete(*keys)
                            
                            # Remove from memory cache and tags
                            for key in keys:
                                key_str = key.decode() if isinstance(key, bytes) else key
                                await self.memory_cache.delete(key_str)
                                await self._remove_tags(key_str)
                        
                        if cursor == 0:
                            break
                            
                except Exception as e:
                    logger.error(f"Redis delete pattern error: {e}")
                    self.stats.errors += 1
            
            self.stats.deletes += count
            return count
            
        except Exception as e:
            logger.error(f"Cache delete pattern error: {e}")
            self.stats.errors += 1
            return 0
    
    async def delete_by_tags(self, tags: List[str]) -> int:
        """Delete all keys associated with given tags."""
        count = 0
        
        async with self._lock:
            keys_to_delete = set()
            
            # Find all keys with any of the specified tags
            for tag in tags:
                if tag in self._tag_keys:
                    keys_to_delete.update(self._tag_keys[tag])
        
        # Delete the keys
        for key in keys_to_delete:
            if await self.delete(key):
                count += 1
        
        return count
    
    async def clear_memory_cache(self) -> None:
        """Clear in-memory cache only."""
        await self.memory_cache.clear()
    
    async def clear_all(self) -> None:
        """Clear all caches."""
        # Clear memory cache
        await self.memory_cache.clear()
        
        # Clear Redis
        if self.redis_client:
            try:
                await self.redis_client.flushdb()
            except Exception as e:
                logger.error(f"Redis flush error: {e}")
                self.stats.errors += 1
        
        # Clear tags
        async with self._lock:
            self._tag_keys.clear()
            self._key_tags.clear()
    
    async def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        stats = self.stats.to_dict()
        
        # Add memory cache info
        stats["memory_cache_size"] = await self.memory_cache.size()
        stats["memory_cache_max_size"] = self.memory_cache.maxsize
        
        # Add Redis info
        if self.redis_client:
            try:
                info = await self.redis_client.info()
                stats["redis_connected"] = True
                stats["redis_used_memory"] = info.get("used_memory_human", "N/A")
                stats["redis_connected_clients"] = info.get("connected_clients", 0)
                stats["redis_total_keys"] = await self.redis_client.dbsize()
            except Exception:
                stats["redis_connected"] = False
        else:
            stats["redis_connected"] = False
        
        return stats


def cached(
    prefix: str,
    ttl: Optional[int] = None,
    tags: Optional[List[str]] = None,
    key_func: Optional[Callable] = None,
    condition: Optional[Callable] = None,
):
    """
    Decorator for caching function results.
    
    Args:
        prefix: Cache key prefix
        ttl: Time to live in seconds
        tags: Tags for cache invalidation
        key_func: Custom key generation function
        condition: Function to determine if result should be cached
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Get cache manager from somewhere (e.g., dependency injection)
            cache_manager = kwargs.get("_cache_manager")
            if not cache_manager:
                # No cache manager, just call function
                return await func(*args, **kwargs)
            
            # Remove cache manager from kwargs
            kwargs = {k: v for k, v in kwargs.items() if k != "_cache_manager"}
            
            # Generate cache key
            if key_func:
                cache_key = key_func(*args, **kwargs)
            else:
                cache_key = cache_manager._generate_key(prefix, *args, **kwargs)
            
            # Try to get from cache
            cached_value = await cache_manager.get(cache_key)
            if cached_value is not None:
                return cached_value
            
            # Call function
            result = await func(*args, **kwargs)
            
            # Cache result if condition is met
            if condition is None or condition(result):
                await cache_manager.set(cache_key, result, ttl=ttl, tags=tags)
            
            return result
        
        return wrapper
    return decorator


# Usage example:
"""
# Initialize cache manager
cache_manager = EnhancedCacheManager(
    redis_client=redis_client,
    memory_cache_size=2000,
    default_ttl=600,
    enable_compression=True,
)

# Use decorator
@cached(
    prefix="search",
    ttl=300,
    tags=["documents", "search"],
    condition=lambda result: len(result) > 0
)
async def search_documents(query: str, limit: int = 10):
    # Expensive search operation
    pass

# Manual cache operations
await cache_manager.set("user:123", user_data, ttl=3600, tags=["users"])
user = await cache_manager.get("user:123")

# Invalidate by tags
await cache_manager.delete_by_tags(["users"])  # Invalidate all user cache

# Get statistics
stats = await cache_manager.get_stats()
"""