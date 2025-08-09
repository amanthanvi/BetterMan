"""Search result caching for BetterMan."""

import hashlib
import json
import logging
import pickle
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, Tuple
from redis import Redis, ConnectionPool
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


class SearchCache:
    """High-performance search result caching using Redis with fallback to in-memory cache."""
    
    def __init__(self, redis_url: Optional[str] = None, ttl: int = 300, max_memory_cache: int = 1000):
        """Initialize search cache.
        
        Args:
            redis_url: Redis connection URL (if None, uses in-memory cache only)
            ttl: Time to live for cache entries in seconds (default 5 minutes)
            max_memory_cache: Maximum number of entries for in-memory cache
        """
        self.ttl = ttl
        self.max_memory_cache = max_memory_cache
        self._memory_cache: Dict[str, Tuple[Any, datetime]] = {}
        self._cache_hits = 0
        self._cache_misses = 0
        
        # Try to connect to Redis
        self.redis_client: Optional[Redis] = None
        if redis_url:
            try:
                pool = ConnectionPool.from_url(redis_url, decode_responses=False)
                self.redis_client = Redis(connection_pool=pool)
                # Test connection
                self.redis_client.ping()
                logger.info("Successfully connected to Redis for search caching")
            except Exception as e:
                logger.warning(f"Failed to connect to Redis: {e}. Using in-memory cache only.")
                self.redis_client = None
        else:
            logger.info("No Redis URL provided. Using in-memory cache only.")
    
    def _generate_cache_key(self, query: str, section: Optional[int], offset: int, limit: int, **kwargs) -> str:
        """Generate a unique cache key for search parameters.
        
        Args:
            query: Search query
            section: Section filter
            offset: Result offset
            limit: Result limit
            **kwargs: Additional parameters
            
        Returns:
            Unique cache key string
        """
        # Create a dictionary of all parameters
        params = {
            'query': query.lower().strip(),
            'section': section,
            'offset': offset,
            'limit': limit,
        }
        params.update(kwargs)
        
        # Sort parameters for consistent hashing
        sorted_params = json.dumps(params, sort_keys=True)
        
        # Generate hash
        key_hash = hashlib.md5(sorted_params.encode()).hexdigest()
        return f"search:v2:{key_hash}"
    
    def get(self, query: str, section: Optional[int], offset: int, limit: int, **kwargs) -> Optional[Dict[str, Any]]:
        """Get cached search results.
        
        Args:
            query: Search query
            section: Section filter
            offset: Result offset
            limit: Result limit
            **kwargs: Additional parameters
            
        Returns:
            Cached search results or None if not found
        """
        cache_key = self._generate_cache_key(query, section, offset, limit, **kwargs)
        
        # Try Redis first
        if self.redis_client:
            try:
                cached_data = self.redis_client.get(cache_key)
                if cached_data:
                    self._cache_hits += 1
                    logger.debug(f"Redis cache hit for key: {cache_key}")
                    return pickle.loads(cached_data)
            except Exception as e:
                logger.error(f"Redis get error: {e}")
        
        # Fallback to memory cache
        if cache_key in self._memory_cache:
            cached_result, timestamp = self._memory_cache[cache_key]
            if datetime.utcnow() - timestamp < timedelta(seconds=self.ttl):
                self._cache_hits += 1
                logger.debug(f"Memory cache hit for key: {cache_key}")
                return cached_result
            else:
                # Expired entry
                del self._memory_cache[cache_key]
        
        self._cache_misses += 1
        return None
    
    def set(self, query: str, section: Optional[int], offset: int, limit: int, 
            results: Dict[str, Any], **kwargs) -> None:
        """Store search results in cache.
        
        Args:
            query: Search query
            section: Section filter
            offset: Result offset
            limit: Result limit
            results: Search results to cache
            **kwargs: Additional parameters
        """
        cache_key = self._generate_cache_key(query, section, offset, limit, **kwargs)
        
        # Store in Redis if available
        if self.redis_client:
            try:
                serialized_data = pickle.dumps(results)
                self.redis_client.setex(cache_key, self.ttl, serialized_data)
                logger.debug(f"Stored in Redis cache: {cache_key}")
            except Exception as e:
                logger.error(f"Redis set error: {e}")
        
        # Always store in memory cache as fallback
        self._memory_cache[cache_key] = (results, datetime.utcnow())
        
        # Evict old entries if memory cache is full
        if len(self._memory_cache) > self.max_memory_cache:
            self._evict_memory_cache()
    
    def _evict_memory_cache(self) -> None:
        """Evict oldest entries from memory cache."""
        # Sort by timestamp and keep only the newest entries
        sorted_entries = sorted(
            self._memory_cache.items(),
            key=lambda x: x[1][1],  # Sort by timestamp
            reverse=True
        )
        
        # Keep only max_memory_cache entries
        self._memory_cache = dict(sorted_entries[:self.max_memory_cache])
        logger.debug(f"Evicted memory cache to {len(self._memory_cache)} entries")
    
    def invalidate_pattern(self, pattern: str) -> int:
        """Invalidate cache entries matching a pattern.
        
        Args:
            pattern: Pattern to match (e.g., "search:v2:*")
            
        Returns:
            Number of entries invalidated
        """
        count = 0
        
        # Invalidate in Redis
        if self.redis_client:
            try:
                # Use SCAN to find matching keys
                cursor = 0
                while True:
                    cursor, keys = self.redis_client.scan(cursor, match=pattern, count=100)
                    if keys:
                        self.redis_client.delete(*keys)
                        count += len(keys)
                    if cursor == 0:
                        break
                logger.info(f"Invalidated {count} Redis cache entries matching pattern: {pattern}")
            except Exception as e:
                logger.error(f"Redis invalidate error: {e}")
        
        # Invalidate in memory cache
        memory_count = 0
        keys_to_delete = [k for k in self._memory_cache.keys() if pattern.replace('*', '') in k]
        for key in keys_to_delete:
            del self._memory_cache[key]
            memory_count += 1
        
        if memory_count > 0:
            logger.info(f"Invalidated {memory_count} memory cache entries")
        
        return count + memory_count
    
    def invalidate_all(self) -> None:
        """Clear all cache entries."""
        # Clear Redis
        if self.redis_client:
            try:
                self.redis_client.flushdb()
                logger.info("Cleared all Redis cache entries")
            except Exception as e:
                logger.error(f"Redis flush error: {e}")
        
        # Clear memory cache
        self._memory_cache.clear()
        logger.info("Cleared all memory cache entries")
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get cache statistics.
        
        Returns:
            Dictionary with cache statistics
        """
        total_requests = self._cache_hits + self._cache_misses
        hit_rate = (self._cache_hits / total_requests * 100) if total_requests > 0 else 0
        
        stats = {
            'cache_hits': self._cache_hits,
            'cache_misses': self._cache_misses,
            'hit_rate': round(hit_rate, 2),
            'memory_cache_size': len(self._memory_cache),
            'memory_cache_max': self.max_memory_cache,
            'ttl_seconds': self.ttl,
        }
        
        # Add Redis stats if available
        if self.redis_client:
            try:
                info = self.redis_client.info()
                stats['redis_connected'] = True
                stats['redis_used_memory'] = info.get('used_memory_human', 'N/A')
                stats['redis_keys'] = self.redis_client.dbsize()
            except Exception as e:
                logger.error(f"Error getting Redis stats: {e}")
                stats['redis_connected'] = False
        else:
            stats['redis_connected'] = False
        
        return stats
    
    def warm_up(self, db: Session, common_queries: list) -> None:
        """Warm up cache with common queries.
        
        Args:
            db: Database session
            common_queries: List of common search queries to pre-cache
        """
        logger.info(f"Warming up search cache with {len(common_queries)} queries")
        
        # Import here to avoid circular dependency
        from ..search.optimized_search import OptimizedSearchEngine
        
        search_engine = OptimizedSearchEngine(db)
        warmed_up = 0
        
        for query in common_queries:
            try:
                # Check if already cached
                if not self.get(query, None, 0, 20):
                    # Perform search and cache results
                    results = search_engine.search(query, limit=20, offset=0)
                    self.set(query, None, 0, 20, results)
                    warmed_up += 1
            except Exception as e:
                logger.error(f"Error warming up cache for query '{query}': {e}")
        
        logger.info(f"Warmed up cache with {warmed_up} new entries")


# Global cache instance
_search_cache_instance: Optional[SearchCache] = None


def get_search_cache(redis_url: Optional[str] = None) -> SearchCache:
    """Get or create search cache instance (singleton).
    
    Args:
        redis_url: Redis connection URL
        
    Returns:
        SearchCache instance
    """
    global _search_cache_instance
    if _search_cache_instance is None:
        _search_cache_instance = SearchCache(redis_url)
    return _search_cache_instance