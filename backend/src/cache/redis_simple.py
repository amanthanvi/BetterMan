"""Simple Redis caching for BetterMan API."""

import os
import json
import redis
from typing import Optional, Any
from functools import wraps
import hashlib

# Redis connection
REDIS_URL = os.environ.get('REDIS_URL')
redis_client = None

if REDIS_URL:
    try:
        redis_client = redis.from_url(REDIS_URL, decode_responses=True)
        redis_client.ping()
        print(f"✅ Redis connected successfully")
    except Exception as e:
        print(f"⚠️ Redis connection failed: {e}")
        redis_client = None
else:
    print("ℹ️ Redis URL not configured, caching disabled")

def get_cache_key(prefix: str, *args, **kwargs) -> str:
    """Generate a cache key from prefix and arguments."""
    key_parts = [prefix]
    key_parts.extend(str(arg) for arg in args)
    key_parts.extend(f"{k}={v}" for k, v in sorted(kwargs.items()))
    key_string = ":".join(key_parts)
    
    # Hash if too long
    if len(key_string) > 200:
        hash_suffix = hashlib.md5(key_string.encode()).hexdigest()[:8]
        key_string = f"{key_string[:150]}:{hash_suffix}"
    
    return key_string

def cache_result(prefix: str, ttl: int = 3600):
    """
    Decorator to cache function results in Redis.
    
    Args:
        prefix: Cache key prefix
        ttl: Time to live in seconds (default 1 hour)
    """
    def decorator(func):
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            if not redis_client:
                return await func(*args, **kwargs)
            
            cache_key = get_cache_key(prefix, *args, **kwargs)
            
            try:
                # Try to get from cache
                cached = redis_client.get(cache_key)
                if cached:
                    return json.loads(cached)
            except Exception as e:
                print(f"Cache read error: {e}")
            
            # Call function and cache result
            result = await func(*args, **kwargs)
            
            try:
                redis_client.setex(
                    cache_key,
                    ttl,
                    json.dumps(result)
                )
            except Exception as e:
                print(f"Cache write error: {e}")
            
            return result
        
        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            if not redis_client:
                return func(*args, **kwargs)
            
            cache_key = get_cache_key(prefix, *args, **kwargs)
            
            try:
                # Try to get from cache
                cached = redis_client.get(cache_key)
                if cached:
                    return json.loads(cached)
            except Exception as e:
                print(f"Cache read error: {e}")
            
            # Call function and cache result
            result = func(*args, **kwargs)
            
            try:
                redis_client.setex(
                    cache_key,
                    ttl,
                    json.dumps(result)
                )
            except Exception as e:
                print(f"Cache write error: {e}")
            
            return result
        
        # Return appropriate wrapper based on function type
        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator

def invalidate_cache(pattern: str):
    """Invalidate cache entries matching a pattern."""
    if not redis_client:
        return
    
    try:
        keys = redis_client.keys(pattern)
        if keys:
            redis_client.delete(*keys)
            print(f"Invalidated {len(keys)} cache entries")
    except Exception as e:
        print(f"Cache invalidation error: {e}")

def get_cached(key: str) -> Optional[Any]:
    """Get a value from cache."""
    if not redis_client:
        return None
    
    try:
        cached = redis_client.get(key)
        if cached:
            return json.loads(cached)
    except Exception as e:
        print(f"Cache get error: {e}")
    
    return None

def set_cached(key: str, value: Any, ttl: int = 3600):
    """Set a value in cache."""
    if not redis_client:
        return
    
    try:
        redis_client.setex(
            key,
            ttl,
            json.dumps(value)
        )
    except Exception as e:
        print(f"Cache set error: {e}")