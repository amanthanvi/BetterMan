"""
Monitoring and metrics for BetterMan.
"""

import time
import logging
from typing import Callable, Dict, Any, List, Optional
from functools import wraps
from prometheus_client import Counter, Histogram, Gauge, Info, generate_latest
from prometheus_client.core import CollectorRegistry
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from .config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Create a custom registry
registry = CollectorRegistry()

# Application info
app_info = Info(
    'betterman_app',
    'Application information',
    registry=registry
)
app_info.info({
    'version': settings.APP_VERSION,
    'environment': settings.ENVIRONMENT
})

# Request metrics
request_count = Counter(
    'betterman_http_requests_total',
    'Total HTTP requests',
    ['method', 'endpoint', 'status'],
    registry=registry
)

request_duration = Histogram(
    'betterman_http_request_duration_seconds',
    'HTTP request duration in seconds',
    ['method', 'endpoint'],
    registry=registry
)

# Search metrics
search_count = Counter(
    'betterman_search_requests_total',
    'Total search requests',
    ['status'],
    registry=registry
)

search_duration = Histogram(
    'betterman_search_duration_seconds',
    'Search duration in seconds',
    registry=registry
)

search_results = Histogram(
    'betterman_search_results_count',
    'Number of search results returned',
    registry=registry
)

# Document metrics
document_imports = Counter(
    'betterman_document_imports_total',
    'Total document imports',
    ['status'],
    registry=registry
)

document_views = Counter(
    'betterman_document_views_total',
    'Total document views',
    ['format'],
    registry=registry
)

# Cache metrics
cache_hits = Counter(
    'betterman_cache_hits_total',
    'Total cache hits',
    registry=registry
)

cache_misses = Counter(
    'betterman_cache_misses_total',
    'Total cache misses',
    registry=registry
)

cache_size = Gauge(
    'betterman_cache_size_documents',
    'Number of documents in cache',
    registry=registry
)

# Database metrics
db_connections = Gauge(
    'betterman_db_connections_active',
    'Active database connections',
    registry=registry
)

db_query_duration = Histogram(
    'betterman_db_query_duration_seconds',
    'Database query duration',
    ['operation'],
    registry=registry
)

# Error metrics
error_count = Counter(
    'betterman_errors_total',
    'Total errors',
    ['type', 'endpoint'],
    registry=registry
)


class MetricsMiddleware(BaseHTTPMiddleware):
    """Middleware to collect request metrics."""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip metrics endpoint to avoid recursion
        if request.url.path == "/metrics":
            return await call_next(request)
        
        # Start timing
        start_time = time.time()
        
        # Get endpoint path
        endpoint = request.url.path
        method = request.method
        
        # Process request
        response = None
        try:
            response = await call_next(request)
            duration = time.time() - start_time
            
            # Record metrics
            request_count.labels(
                method=method,
                endpoint=endpoint,
                status=response.status_code
            ).inc()
            
            request_duration.labels(
                method=method,
                endpoint=endpoint
            ).observe(duration)
            
            # Track specific endpoint metrics
            if "/search" in endpoint:
                search_count.labels(status="success").inc()
                search_duration.observe(duration)
            elif "/docs/" in endpoint and "/import" not in endpoint:
                format_type = "html" if "/html" in endpoint else "json"
                document_views.labels(format=format_type).inc()
            
            return response
            
        except Exception as e:
            duration = time.time() - start_time
            
            # Record error metrics
            error_count.labels(
                type=type(e).__name__,
                endpoint=endpoint
            ).inc()
            
            request_count.labels(
                method=method,
                endpoint=endpoint,
                status=500
            ).inc()
            
            request_duration.labels(
                method=method,
                endpoint=endpoint
            ).observe(duration)
            
            raise


def track_search_results(count: int):
    """Track number of search results."""
    search_results.observe(count)


def track_document_import(success: bool):
    """Track document import."""
    status = "success" if success else "failure"
    document_imports.labels(status=status).inc()


def track_cache_access(hit: bool):
    """Track cache hit/miss."""
    if hit:
        cache_hits.inc()
    else:
        cache_misses.inc()


def update_cache_size(size: int):
    """Update cache size gauge."""
    cache_size.set(size)


def track_db_query(operation: str, duration: float):
    """Track database query performance."""
    db_query_duration.labels(operation=operation).observe(duration)


def update_db_connections(count: int):
    """Update active database connections."""
    db_connections.set(count)


def metrics_endpoint():
    """Generate Prometheus metrics."""
    return generate_latest(registry)


class Analytics:
    """Analytics tracking for user behavior."""
    
    def __init__(self, db_session):
        self.db = db_session
    
    def track_search(self, query: str, results_count: int, user_ip: str):
        """Track search query."""
        try:
            # Hash IP for privacy
            from .security import SecurityUtils
            hashed_ip = SecurityUtils.hash_ip_address(user_ip)
            
            # Log search analytics
            logger.info(
                "Search analytics",
                extra={
                    "event": "search",
                    "query_length": len(query),
                    "results_count": results_count,
                    "user_hash": hashed_ip,
                }
            )
            
            # Update metrics
            track_search_results(results_count)
            
        except Exception as e:
            logger.warning(f"Failed to track search: {e}")
    
    def track_document_view(self, doc_id: str, doc_name: str, user_ip: str):
        """Track document view."""
        try:
            # Hash IP for privacy
            from .security import SecurityUtils
            hashed_ip = SecurityUtils.hash_ip_address(user_ip)
            
            # Log view analytics
            logger.info(
                "Document view analytics",
                extra={
                    "event": "document_view",
                    "document_id": doc_id,
                    "document_name": doc_name,
                    "user_hash": hashed_ip,
                }
            )
            
        except Exception as e:
            logger.warning(f"Failed to track document view: {e}")
    
    def get_popular_searches(self, days: int = 7, limit: int = 20) -> List[Dict[str, Any]]:
        """Get popular search queries."""
        # This would query from a search_analytics table
        # For now, return empty list
        return []
    
    def get_popular_documents(self, days: int = 7, limit: int = 20) -> List[Dict[str, Any]]:
        """Get popular documents."""
        # Query from documents table based on access_count
        from ..models.document import Document
        
        try:
            popular = (
                self.db.query(Document)
                .filter(Document.access_count > 0)
                .order_by(Document.access_count.desc())
                .limit(limit)
                .all()
            )
            
            return [
                {
                    "name": doc.name,
                    "title": doc.title,
                    "access_count": doc.access_count,
                    "section": doc.section
                }
                for doc in popular
            ]
        except Exception as e:
            logger.error(f"Failed to get popular documents: {e}")
            return []


def setup_monitoring(app):
    """Configure monitoring for the application."""
    if not settings.METRICS_ENABLED:
        logger.info("Metrics disabled")
        return
    
    # Add metrics middleware
    app.add_middleware(MetricsMiddleware)
    
    # Add metrics endpoint
    @app.get("/metrics", include_in_schema=False)
    async def get_metrics():
        """Prometheus metrics endpoint."""
        return Response(
            content=metrics_endpoint(),
            media_type="text/plain; version=0.0.4"
        )
    
    logger.info("Monitoring configured successfully")