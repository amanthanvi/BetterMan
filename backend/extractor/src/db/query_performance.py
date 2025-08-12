"""
Query performance optimization utilities for BetterMan.
"""

import time
import logging
from typing import Any, Dict, List, Optional, Callable
from functools import wraps
from contextlib import contextmanager

from sqlalchemy import event, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Query, Session
from sqlalchemy.sql import Select

from ..monitoring_metrics import metrics

logger = logging.getLogger(__name__)


class QueryPerformanceMonitor:
    """Monitor and optimize database query performance."""
    
    def __init__(self, slow_query_threshold: float = 0.5):
        self.slow_query_threshold = slow_query_threshold
        self.query_stats: Dict[str, Dict[str, Any]] = {}
        
    def track_query(self, query: str, duration: float, params: Optional[Dict] = None):
        """Track query execution statistics."""
        query_hash = hash(query)
        
        if query_hash not in self.query_stats:
            self.query_stats[query_hash] = {
                'query': query,
                'count': 0,
                'total_time': 0,
                'avg_time': 0,
                'max_time': 0,
                'min_time': float('inf'),
            }
        
        stats = self.query_stats[query_hash]
        stats['count'] += 1
        stats['total_time'] += duration
        stats['avg_time'] = stats['total_time'] / stats['count']
        stats['max_time'] = max(stats['max_time'], duration)
        stats['min_time'] = min(stats['min_time'], duration)
        
        # Log slow queries
        if duration > self.slow_query_threshold:
            logger.warning(
                f"Slow query detected",
                extra={
                    'query': query[:100],
                    'duration': duration,
                    'params': params,
                }
            )
            
    def get_slow_queries(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get the slowest queries."""
        sorted_queries = sorted(
            self.query_stats.values(),
            key=lambda x: x['avg_time'],
            reverse=True
        )
        return sorted_queries[:limit]
    
    def get_frequent_queries(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get the most frequent queries."""
        sorted_queries = sorted(
            self.query_stats.values(),
            key=lambda x: x['count'],
            reverse=True
        )
        return sorted_queries[:limit]


# Global performance monitor
performance_monitor = QueryPerformanceMonitor()


def setup_query_monitoring(engine: Engine):
    """Set up SQLAlchemy event listeners for query monitoring."""
    
    @event.listens_for(engine, "before_cursor_execute")
    def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        conn.info.setdefault('query_start_time', []).append(time.time())
        
    @event.listens_for(engine, "after_cursor_execute")
    def after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        start_times = conn.info.get('query_start_time', [])
        if start_times:
            duration = time.time() - start_times.pop()
            performance_monitor.track_query(statement, duration, parameters)
            
            # Update metrics
            metrics.database_query_duration.observe(duration)
            metrics.database_queries_total.inc()


def optimize_query(query: Query) -> Query:
    """Apply common query optimizations."""
    # Enable query result caching
    query = query.execution_options(compiled_cache={})
    
    # Add query hints for better execution plans
    if hasattr(query, 'statement'):
        stmt = query.statement
        if hasattr(stmt, 'prefix_with'):
            # Add index hints for MySQL/MariaDB
            stmt = stmt.prefix_with("/*+ INDEX(documents idx_name_section) */", dialect='mysql')
    
    return query


def batch_insert(session: Session, model_class: Any, records: List[Dict], batch_size: int = 1000):
    """Efficiently insert multiple records in batches."""
    total_records = len(records)
    
    for i in range(0, total_records, batch_size):
        batch = records[i:i + batch_size]
        
        # Use bulk_insert_mappings for better performance
        session.bulk_insert_mappings(model_class, batch)
        
        # Commit after each batch to avoid memory issues
        session.commit()
        
        # Log progress
        logger.info(f"Inserted batch {i//batch_size + 1}/{(total_records + batch_size - 1)//batch_size}")


def batch_update(session: Session, model_class: Any, updates: List[Dict], batch_size: int = 500):
    """Efficiently update multiple records in batches."""
    total_updates = len(updates)
    
    for i in range(0, total_updates, batch_size):
        batch = updates[i:i + batch_size]
        
        # Use bulk_update_mappings for better performance
        session.bulk_update_mappings(model_class, batch)
        
        # Commit after each batch
        session.commit()
        
        logger.info(f"Updated batch {i//batch_size + 1}/{(total_updates + batch_size - 1)//batch_size}")


@contextmanager
def query_explain(session: Session):
    """Context manager to explain queries for debugging."""
    original_echo = session.bind.echo
    session.bind.echo = True
    
    try:
        yield
    finally:
        session.bind.echo = original_echo


def analyze_table_statistics(session: Session, table_name: str) -> Dict[str, Any]:
    """Analyze table statistics for optimization."""
    stats = {}
    
    # Get table size
    result = session.execute(
        text(f"SELECT COUNT(*) as count FROM {table_name}")
    ).first()
    stats['row_count'] = result.count if result else 0
    
    # Get index usage (PostgreSQL specific)
    if session.bind.dialect.name == 'postgresql':
        index_stats = session.execute(
            text(f"""
                SELECT 
                    indexrelname as index_name,
                    idx_scan as index_scans,
                    idx_tup_read as tuples_read,
                    idx_tup_fetch as tuples_fetched
                FROM pg_stat_user_indexes
                WHERE schemaname = 'public' AND tablename = '{table_name}'
            """)
        ).fetchall()
        
        stats['indexes'] = [
            {
                'name': row.index_name,
                'scans': row.index_scans,
                'tuples_read': row.tuples_read,
                'tuples_fetched': row.tuples_fetched,
            }
            for row in index_stats
        ]
    
    return stats


def create_missing_indexes(session: Session):
    """Create missing indexes based on query patterns."""
    # Analyze slow queries to suggest indexes
    slow_queries = performance_monitor.get_slow_queries()
    
    suggested_indexes = []
    
    for query_stat in slow_queries:
        query = query_stat['query'].lower()
        
        # Simple heuristic: look for WHERE clauses
        if 'where' in query:
            # Extract column names from WHERE clause
            # This is a simplified approach - in production, use proper SQL parsing
            where_clause = query.split('where')[1].split('order by')[0]
            
            # Look for column comparisons
            import re
            columns = re.findall(r'(\w+)\s*[=<>]', where_clause)
            
            for column in columns:
                if column not in ['and', 'or', 'not']:
                    suggested_indexes.append(column)
    
    # Return unique suggestions
    return list(set(suggested_indexes))


def query_cache(key_func: Optional[Callable] = None, ttl: int = 300):
    """Decorator to cache query results."""
    def decorator(func):
        cache = {}
        
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Generate cache key
            if key_func:
                cache_key = key_func(*args, **kwargs)
            else:
                cache_key = f"{func.__name__}:{str(args)}:{str(kwargs)}"
            
            # Check cache
            if cache_key in cache:
                entry = cache[cache_key]
                if time.time() - entry['time'] < ttl:
                    return entry['value']
            
            # Execute query
            result = func(*args, **kwargs)
            
            # Cache result
            cache[cache_key] = {
                'value': result,
                'time': time.time(),
            }
            
            # Clean old entries
            current_time = time.time()
            cache_copy = cache.copy()
            for k, v in cache_copy.items():
                if current_time - v['time'] > ttl:
                    del cache[k]
            
            return result
        
        return wrapper
    return decorator