"""
Performance optimizations for BetterMan.
"""

import asyncio
import time
import hashlib
from typing import Optional, Dict, Any, List, Callable
from functools import wraps, lru_cache
from concurrent.futures import ThreadPoolExecutor
import gzip
import json
from fastapi import Request, Response
from fastapi.responses import JSONResponse
import redis
from contextlib import asynccontextmanager

from .config import get_settings
from .monitoring import track_cache_access

settings = get_settings()

# Thread pool for CPU-intensive tasks
thread_pool = ThreadPoolExecutor(max_workers=4)

# Redis client for distributed caching
redis_client: Optional[redis.Redis] = None

try:
    redis_client = redis.Redis(
        host="redis",
        port=6379,
        db=0,
        decode_responses=True,
        socket_timeout=5,
        socket_connect_timeout=5,
        retry_on_timeout=True,
    )
    # Test connection
    redis_client.ping()
except Exception:
    redis_client = None


class MemoryCache:
    """In-memory LRU cache with TTL support."""

    def __init__(self, max_size: int = 1000, default_ttl: int = 3600):
        self.max_size = max_size
        self.default_ttl = default_ttl
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._access_times: Dict[str, float] = {}

    def get(self, key: str) -> Optional[Any]:
        """Get value from cache."""
        if key not in self._cache:
            track_cache_access(False)
            return None

        # Check TTL
        entry = self._cache[key]
        if time.time() > entry["expires"]:
            self.delete(key)
            track_cache_access(False)
            return None

        # Update access time
        self._access_times[key] = time.time()
        track_cache_access(True)
        return entry["value"]

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Set value in cache."""
        if ttl is None:
            ttl = self.default_ttl

        # Evict if at capacity
        if len(self._cache) >= self.max_size and key not in self._cache:
            self._evict_lru()

        expires = time.time() + ttl
        self._cache[key] = {"value": value, "expires": expires}
        self._access_times[key] = time.time()

    def delete(self, key: str) -> None:
        """Delete key from cache."""
        self._cache.pop(key, None)
        self._access_times.pop(key, None)

    def _evict_lru(self) -> None:
        """Evict least recently used item."""
        if not self._access_times:
            return

        lru_key = min(self._access_times.keys(), key=lambda k: self._access_times[k])
        self.delete(lru_key)

    def clear(self) -> None:
        """Clear all cached items."""
        self._cache.clear()
        self._access_times.clear()

    def size(self) -> int:
        """Get current cache size."""
        return len(self._cache)


# Global cache instance
memory_cache = MemoryCache(
    max_size=settings.CACHE_MAX_SIZE, default_ttl=settings.CACHE_TTL
)


class CacheManager:
    """Unified cache management with fallback layers."""

    def __init__(self):
        self.redis = redis_client
        self.memory = memory_cache

    async def get(self, key: str) -> Optional[Any]:
        """Get value with fallback from Redis to memory."""
        # Try memory cache first
        value = self.memory.get(key)
        if value is not None:
            return value

        # Try Redis if available
        if self.redis:
            try:
                value = await asyncio.get_event_loop().run_in_executor(
                    thread_pool, self.redis.get, key
                )
                if value:
                    # Deserialize and store in memory
                    value = json.loads(value)
                    self.memory.set(key, value)
                    return value
            except Exception:
                pass

        return None

    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Set value in both caches."""
        if ttl is None:
            ttl = settings.CACHE_TTL

        # Store in memory
        self.memory.set(key, value, ttl)

        # Store in Redis if available
        if self.redis:
            try:
                serialized = json.dumps(value, default=str)
                await asyncio.get_event_loop().run_in_executor(
                    thread_pool, self.redis.setex, key, ttl, serialized
                )
            except Exception:
                pass

    async def delete(self, key: str) -> None:
        """Delete from both caches."""
        self.memory.delete(key)

        if self.redis:
            try:
                await asyncio.get_event_loop().run_in_executor(
                    thread_pool, self.redis.delete, key
                )
            except Exception:
                pass


cache_manager = CacheManager()


def cache_key(*args, **kwargs) -> str:
    """Generate cache key from arguments."""
    key_data = f"{args}:{sorted(kwargs.items())}"
    return hashlib.sha256(key_data.encode()).hexdigest()[:16]  # Use first 16 chars for shorter keys


def cached(ttl: Optional[int] = None, key_prefix: str = ""):
    """Decorator for caching function results."""

    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Generate cache key
            key = f"{key_prefix}:{cache_key(*args, **kwargs)}"

            # Try to get from cache
            result = await cache_manager.get(key)
            if result is not None:
                return result

            # Call function and cache result
            if asyncio.iscoroutinefunction(func):
                result = await func(*args, **kwargs)
            else:
                result = await asyncio.get_event_loop().run_in_executor(
                    thread_pool, func, *args, **kwargs
                )

            await cache_manager.set(key, result, ttl)
            return result

        return wrapper

    return decorator


class CompressionMiddleware:
    """Middleware for response compression."""

    def __init__(self, app, minimum_size: int = 1024):
        self.app = app
        self.minimum_size = minimum_size

    async def __call__(self, scope, receive, send):
        # Temporarily disable compression to fix content-length errors
        await self.app(scope, receive, send)


@asynccontextmanager
async def performance_context():
    """Context manager for performance monitoring."""
    start_time = time.time()
    try:
        yield
    finally:
        duration = time.time() - start_time
        if duration > 1.0:  # Log slow operations
            import logging

            logger = logging.getLogger(__name__)
            logger.warning(f"Slow operation detected: {duration:.2f}s")


class DatabaseOptimizer:
    """Database query optimization utilities."""

    @staticmethod
    def get_search_query_optimized(session, query: str, limit: int = 20):
        """Optimized search query with proper indexing."""
        from sqlalchemy import text

        # Use parameterized query with full-text search
        sql = text(
            """
            SELECT 
                id, name, title, section, summary,
                ts_rank(search_vector, plainto_tsquery(:query)) as rank
            FROM documents 
            WHERE search_vector @@ plainto_tsquery(:query)
            ORDER BY rank DESC, access_count DESC
            LIMIT :limit
        """
        )

        return session.execute(sql, {"query": query, "limit": limit}).fetchall()

    @staticmethod
    def warmup_cache(session):
        """Warm up cache with popular documents."""
        from sqlalchemy import text

        # Get most accessed documents
        popular_docs = session.execute(
            text(
                """
            SELECT id, name, title, section, summary
            FROM documents 
            WHERE access_count > 5
            ORDER BY access_count DESC
            LIMIT 50
        """
            )
        ).fetchall()

        # Cache them
        for doc in popular_docs:
            key = f"doc:{doc.name}"
            asyncio.create_task(cache_manager.set(key, dict(doc._mapping)))


async def preload_critical_data():
    """Preload critical data for better performance."""
    from .db.session import SessionLocal

    db = SessionLocal()
    try:
        DatabaseOptimizer.warmup_cache(db)
    except Exception as e:
        import logging

        logger = logging.getLogger(__name__)
        logger.warning(f"Failed to preload data: {e}")
    finally:
        db.close()


def setup_performance_monitoring():
    """Setup performance monitoring and optimization."""
    import logging

    logger = logging.getLogger(__name__)

    # Log cache status
    logger.info(
        f"Cache configured: Redis={'available' if redis_client else 'unavailable'}"
    )
    logger.info(f"Memory cache size: {memory_cache.max_size}")

    # Cache warmup will be scheduled in the lifespan context


class ResponseOptimizer:
    """Response optimization utilities."""

    @staticmethod
    def create_etag(content: str) -> str:
        """Create ETag for content."""
        return hashlib.sha256(content.encode()).hexdigest()[:16]  # Use first 16 chars for ETag

    @staticmethod
    def check_not_modified(request: Request, etag: str) -> bool:
        """Check if content was modified."""
        if_none_match = request.headers.get("if-none-match")
        return if_none_match == etag

    @staticmethod
    def add_cache_headers(response: Response, max_age: int = 3600):
        """Add cache headers to response."""
        response.headers["Cache-Control"] = f"public, max-age={max_age}"
        response.headers["Vary"] = "Accept-Encoding"
