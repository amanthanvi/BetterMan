"""Simple monitoring and metrics for BetterMan API."""

import time
import logging
from datetime import datetime
from typing import Dict, Any
import psutil
import os

logger = logging.getLogger(__name__)

class SimpleMetrics:
    """Simple metrics collector."""
    
    def __init__(self):
        self.start_time = time.time()
        self.request_count = 0
        self.error_count = 0
        self.cache_hits = 0
        self.cache_misses = 0
        self.response_times = []
        
    def record_request(self, duration: float, status_code: int):
        """Record a request."""
        self.request_count += 1
        self.response_times.append(duration)
        
        # Keep only last 1000 response times
        if len(self.response_times) > 1000:
            self.response_times = self.response_times[-1000:]
        
        if status_code >= 400:
            self.error_count += 1
    
    def record_cache_hit(self):
        """Record a cache hit."""
        self.cache_hits += 1
    
    def record_cache_miss(self):
        """Record a cache miss."""
        self.cache_misses += 1
    
    def get_metrics(self) -> Dict[str, Any]:
        """Get current metrics."""
        uptime = time.time() - self.start_time
        avg_response_time = (
            sum(self.response_times) / len(self.response_times)
            if self.response_times else 0
        )
        
        # Get system metrics
        cpu_percent = psutil.cpu_percent(interval=0.1)
        memory = psutil.virtual_memory()
        
        return {
            "uptime_seconds": uptime,
            "requests_total": self.request_count,
            "errors_total": self.error_count,
            "error_rate": self.error_count / max(self.request_count, 1),
            "cache_hits": self.cache_hits,
            "cache_misses": self.cache_misses,
            "cache_hit_rate": self.cache_hits / max(self.cache_hits + self.cache_misses, 1),
            "avg_response_time_ms": avg_response_time * 1000,
            "system": {
                "cpu_percent": cpu_percent,
                "memory_percent": memory.percent,
                "memory_used_mb": memory.used / 1024 / 1024,
                "memory_available_mb": memory.available / 1024 / 1024,
            },
            "timestamp": datetime.utcnow().isoformat(),
        }

# Global metrics instance
metrics = SimpleMetrics()

def track_request(func):
    """Decorator to track request metrics."""
    import functools
    
    @functools.wraps(func)
    async def async_wrapper(*args, **kwargs):
        start_time = time.time()
        status_code = 200
        
        try:
            result = await func(*args, **kwargs)
            if isinstance(result, tuple) and len(result) == 2:
                status_code = result[1]
            return result
        except Exception as e:
            status_code = 500
            raise
        finally:
            duration = time.time() - start_time
            metrics.record_request(duration, status_code)
    
    @functools.wraps(func)
    def sync_wrapper(*args, **kwargs):
        start_time = time.time()
        status_code = 200
        
        try:
            result = func(*args, **kwargs)
            if isinstance(result, tuple) and len(result) == 2:
                status_code = result[1]
            return result
        except Exception as e:
            status_code = 500
            raise
        finally:
            duration = time.time() - start_time
            metrics.record_request(duration, status_code)
    
    import asyncio
    if asyncio.iscoroutinefunction(func):
        return async_wrapper
    else:
        return sync_wrapper