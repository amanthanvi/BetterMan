"""
Performance metrics collection for BetterMan.
"""

import time
import psutil
import asyncio
from typing import Dict, Any, Optional, Callable
from contextlib import contextmanager
from datetime import datetime, timedelta
from collections import defaultdict, deque
import logging

from prometheus_client import Counter, Histogram, Gauge, Info

logger = logging.getLogger(__name__)


# Prometheus metrics
request_count = Counter(
    'betterman_requests_total',
    'Total number of requests',
    ['method', 'endpoint', 'status']
)

request_duration = Histogram(
    'betterman_request_duration_seconds',
    'Request duration in seconds',
    ['method', 'endpoint']
)

active_requests = Gauge(
    'betterman_active_requests',
    'Number of active requests'
)

database_queries_total = Counter(
    'betterman_database_queries_total',
    'Total number of database queries'
)

database_query_duration = Histogram(
    'betterman_database_query_duration_seconds',
    'Database query duration in seconds'
)

cache_hits = Counter(
    'betterman_cache_hits_total',
    'Total number of cache hits',
    ['cache_type']
)

cache_misses = Counter(
    'betterman_cache_misses_total',
    'Total number of cache misses',
    ['cache_type']
)

search_queries_total = Counter(
    'betterman_search_queries_total',
    'Total number of search queries'
)

search_duration = Histogram(
    'betterman_search_duration_seconds',
    'Search query duration in seconds'
)

# System metrics
cpu_usage = Gauge(
    'betterman_cpu_usage_percent',
    'CPU usage percentage'
)

memory_usage = Gauge(
    'betterman_memory_usage_bytes',
    'Memory usage in bytes'
)

memory_percent = Gauge(
    'betterman_memory_usage_percent',
    'Memory usage percentage'
)

# Application info
app_info = Info(
    'betterman_app',
    'Application information'
)


class PerformanceTracker:
    """Track and analyze performance metrics."""
    
    def __init__(self, window_size: int = 1000):
        self.window_size = window_size
        self.request_times: deque = deque(maxlen=window_size)
        self.query_times: deque = deque(maxlen=window_size)
        self.endpoint_stats: Dict[str, deque] = defaultdict(lambda: deque(maxlen=100))
        self.error_counts: Dict[str, int] = defaultdict(int)
        self._start_time = time.time()
    
    def record_request(self, method: str, endpoint: str, duration: float, status: int):
        """Record request metrics."""
        self.request_times.append(duration)
        self.endpoint_stats[f"{method} {endpoint}"].append(duration)
        
        if status >= 400:
            self.error_counts[f"{method} {endpoint}"] += 1
    
    def record_query(self, duration: float):
        """Record database query duration."""
        self.query_times.append(duration)
    
    def get_stats(self) -> Dict[str, Any]:
        """Get current performance statistics."""
        uptime = time.time() - self._start_time
        
        # Calculate percentiles
        def percentile(data, p):
            if not data:
                return 0
            sorted_data = sorted(data)
            index = int(len(sorted_data) * p / 100)
            return sorted_data[min(index, len(sorted_data) - 1)]
        
        request_stats = {
            'count': len(self.request_times),
            'mean': sum(self.request_times) / len(self.request_times) if self.request_times else 0,
            'p50': percentile(self.request_times, 50),
            'p90': percentile(self.request_times, 90),
            'p99': percentile(self.request_times, 99),
        }
        
        query_stats = {
            'count': len(self.query_times),
            'mean': sum(self.query_times) / len(self.query_times) if self.query_times else 0,
            'p50': percentile(self.query_times, 50),
            'p90': percentile(self.query_times, 90),
            'p99': percentile(self.query_times, 99),
        }
        
        # Get slowest endpoints
        slowest_endpoints = []
        for endpoint, times in self.endpoint_stats.items():
            if times:
                slowest_endpoints.append({
                    'endpoint': endpoint,
                    'mean': sum(times) / len(times),
                    'count': len(times),
                })
        slowest_endpoints.sort(key=lambda x: x['mean'], reverse=True)
        
        return {
            'uptime_seconds': uptime,
            'requests': request_stats,
            'queries': query_stats,
            'slowest_endpoints': slowest_endpoints[:10],
            'error_counts': dict(self.error_counts),
            'system': self.get_system_metrics(),
        }
    
    def get_system_metrics(self) -> Dict[str, Any]:
        """Get system resource metrics."""
        process = psutil.Process()
        
        return {
            'cpu_percent': process.cpu_percent(interval=0.1),
            'memory_info': {
                'rss': process.memory_info().rss,
                'vms': process.memory_info().vms,
                'percent': process.memory_percent(),
            },
            'num_threads': process.num_threads(),
            'num_fds': process.num_fds() if hasattr(process, 'num_fds') else None,
        }


# Global performance tracker
performance_tracker = PerformanceTracker()


@contextmanager
def timer(metric_name: str):
    """Context manager for timing operations."""
    start_time = time.time()
    try:
        yield
    finally:
        duration = time.time() - start_time
        if metric_name == 'request_duration':
            performance_tracker.record_request('', '', duration, 200)
        elif metric_name == 'query_duration':
            performance_tracker.record_query(duration)
        elif metric_name == 'search_duration':
            search_duration.observe(duration)


class SystemMonitor:
    """Monitor system resources and performance."""
    
    def __init__(self, interval: int = 60):
        self.interval = interval
        self.is_running = False
        self._task: Optional[asyncio.Task] = None
    
    async def start(self):
        """Start monitoring system metrics."""
        self.is_running = True
        self._task = asyncio.create_task(self._monitor_loop())
        logger.info("System monitoring started")
    
    async def stop(self):
        """Stop monitoring."""
        self.is_running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("System monitoring stopped")
    
    async def _monitor_loop(self):
        """Main monitoring loop."""
        while self.is_running:
            try:
                # Update system metrics
                process = psutil.Process()
                
                # CPU usage
                cpu_percent = process.cpu_percent(interval=1)
                cpu_usage.set(cpu_percent)
                
                # Memory usage
                mem_info = process.memory_info()
                memory_usage.set(mem_info.rss)
                memory_percent.set(process.memory_percent())
                
                # Log if resources are high
                if cpu_percent > 80:
                    logger.warning(f"High CPU usage: {cpu_percent}%")
                
                if process.memory_percent() > 80:
                    logger.warning(f"High memory usage: {process.memory_percent()}%")
                
                # Check for memory leaks
                if hasattr(self, '_last_memory'):
                    memory_growth = mem_info.rss - self._last_memory
                    if memory_growth > 100 * 1024 * 1024:  # 100MB growth
                        logger.warning(f"Potential memory leak: {memory_growth / 1024 / 1024:.2f}MB growth")
                
                self._last_memory = mem_info.rss
                
            except Exception as e:
                logger.error(f"Error in system monitoring: {e}")
            
            await asyncio.sleep(self.interval)


# Create global system monitor
system_monitor = SystemMonitor()


def update_app_info(version: str, environment: str):
    """Update application info metrics."""
    app_info.info({
        'version': version,
        'environment': environment,
        'start_time': datetime.now().isoformat(),
    })


class RequestTracker:
    """Track individual request performance."""
    
    def __init__(self, method: str, path: str):
        self.method = method
        self.path = path
        self.start_time = time.time()
        active_requests.inc()
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        duration = time.time() - self.start_time
        status = 500 if exc_type else 200
        
        # Update metrics
        request_count.labels(
            method=self.method,
            endpoint=self.path,
            status=status
        ).inc()
        
        request_duration.labels(
            method=self.method,
            endpoint=self.path
        ).observe(duration)
        
        active_requests.dec()
        
        # Record in performance tracker
        performance_tracker.record_request(
            self.method,
            self.path,
            duration,
            status
        )


def track_cache_access(cache_type: str, hit: bool):
    """Track cache hit/miss."""
    if hit:
        cache_hits.labels(cache_type=cache_type).inc()
    else:
        cache_misses.labels(cache_type=cache_type).inc()


async def collect_metrics() -> Dict[str, Any]:
    """Collect all metrics for reporting."""
    stats = performance_tracker.get_stats()
    
    # Add cache statistics
    stats['cache'] = {
        'redis': {
            'hits': cache_hits.labels(cache_type='redis')._value.get(),
            'misses': cache_misses.labels(cache_type='redis')._value.get(),
        },
        'memory': {
            'hits': cache_hits.labels(cache_type='memory')._value.get(),
            'misses': cache_misses.labels(cache_type='memory')._value.get(),
        }
    }
    
    return stats