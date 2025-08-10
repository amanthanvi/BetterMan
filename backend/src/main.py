"""Main entry point for BetterMan API server."""

import logging
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status, Depends
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy.orm import Session
import os

from .config import get_settings, setup_logging
from .db.postgres_connection import get_db, init_db, check_database_health
from .api import api_router
from .auth import auth_router
from .middleware import setup_middleware
from .errors import (
    BetterManError,
    betterman_error_handler,
    validation_error_handler,
    http_exception_handler,
    generic_exception_handler,
)
from .cache.cache_manager import get_cache_manager
from .security.rate_limiter import RateLimitMiddleware

# Import performance optimizations
from .db.query_performance import setup_query_monitoring, performance_monitor
from .middleware.compression import CompressionMiddleware
from .monitoring_metrics.metrics import system_monitor, update_app_info, RequestTracker
from .search.unified_search import UnifiedSearchEngine as FullTextSearchEngine

# Initialize settings and logging
settings = get_settings()
setup_logging(settings)
logger = logging.getLogger(__name__)

# Import scheduler-related functions
from .jobs.scheduler import get_scheduler


# Global references for cleanup
scheduler = None
search_engine = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manage application lifecycle with proper startup and shutdown.
    """
    global scheduler, search_engine

    # Startup
    try:
        logger.info("Starting BetterMan API...")

        # Initialize database with query monitoring
        logger.info("Initializing database...")
        init_db()
        
        # Note: Async database initialization removed to prevent asyncpg issues
        # Use synchronous connections with psycopg3 for stability
        
        # Setup query performance monitoring
        from .db.postgres_connection import engine
        setup_query_monitoring(engine)
        logger.info("Query monitoring enabled")

        # Initialize scheduler
        logger.info("Initializing scheduler...")
        scheduler = get_scheduler(settings.DATABASE_URL)
        if not scheduler.running:
            scheduler.start()
        logger.info("Scheduler initialized successfully")

        # Initialize full-text search engine
        try:
            db = next(get_db())
            search_engine = FullTextSearchEngine(db)
            logger.info("Full-text search engine initialized")
        except Exception as e:
            logger.error(f"Error initializing search engine: {e}")
            # Fallback to regular search
            from .search.unified_search import UnifiedSearchEngine
            search_engine = UnifiedSearchEngine(db)
            logger.info("Fallback search engine initialized")

        # Start system monitoring
        await system_monitor.start()
        logger.info("System monitoring started")
        
        # Update app info metrics
        update_app_info(settings.APP_VERSION, settings.ENVIRONMENT)

        logger.info(f"BetterMan API started in {settings.ENVIRONMENT} mode")

    except Exception as e:
        logger.error(f"Startup error: {e}")
        raise

    yield

    # Shutdown
    try:
        logger.info("Shutting down BetterMan API...")

        # Stop system monitoring
        await system_monitor.stop()
        logger.info("System monitoring stopped")

        # Shutdown scheduler
        if scheduler and scheduler.running:
            scheduler.stop()
            logger.info("Scheduler shut down")

        # Cleanup search engine
        if search_engine:
            # Add any cleanup if needed
            pass

        # Log performance stats
        stats = performance_monitor.get_stats()
        logger.info(f"Performance stats: {stats}")

        logger.info("BetterMan API stopped")

    except Exception as e:
        logger.error(f"Shutdown error: {e}")


# Create FastAPI app with lifespan
app = FastAPI(
    title=settings.APP_NAME,
    description="Modern interface for Linux documentation with advanced search, caching, and authentication",
    version=settings.APP_VERSION,
    lifespan=lifespan,
    docs_url="/api/swagger" if settings.DEBUG else None,
    redoc_url="/api/redoc" if settings.DEBUG else None,
    openapi_url="/api/openapi.json" if settings.DEBUG else None,
    swagger_ui_parameters={
        "persistAuthorization": True,
        "displayRequestDuration": True,
    },
)

# Setup middleware
setup_middleware(app)

# Add compression middleware with optimized settings
app.add_middleware(
    CompressionMiddleware,
    minimum_size=1024,  # Only compress responses > 1KB
    gzip_level=6,       # Balanced compression
    brotli_quality=4,   # Fast brotli compression
    exclude_paths=["/health", "/metrics"],  # Don't compress health checks
)

# Add request tracking middleware
@app.middleware("http")
async def track_requests(request: Request, call_next):
    """Track request performance metrics."""
    # Skip tracking for health checks
    if request.url.path in ["/health", "/metrics"]:
        return await call_next(request)
    
    with RequestTracker(request.method, request.url.path):
        response = await call_next(request)
        return response

# Setup security
from .security_utils import setup_security
setup_security(app)

# Setup monitoring
from . import monitoring
monitoring.setup_monitoring(app)

# Setup performance optimizations
from .performance import setup_performance_monitoring

setup_performance_monitoring()

# Add exception handlers
app.add_exception_handler(BetterManError, betterman_error_handler)
app.add_exception_handler(RequestValidationError, validation_error_handler)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(Exception, generic_exception_handler)

# Include API routes
app.include_router(api_router, prefix=settings.API_PREFIX)

# Include authentication routes
app.include_router(auth_router, prefix="/api")


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "Welcome to BetterMan API",
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
        "docs": "/api/docs" if settings.DEBUG else None,
    }


@app.get("/health")
async def health_check(db: Session = Depends(get_db)):
    """
    Comprehensive health check endpoint.

    Returns:
        Health status with component checks
    """
    health_status = {
        "status": "ok",
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
        "components": {},
    }

    # Check database
    try:
        # Simple query to verify connection
        from sqlalchemy import text

        db.execute(text("SELECT 1"))
        health_status["components"]["database"] = "healthy"
    except Exception as e:
        health_status["status"] = "degraded"
        health_status["components"]["database"] = f"unhealthy: {str(e)}"
    
    # Check cache (Redis)
    try:
        cache = get_cache_manager(db)
        if hasattr(cache, 'redis_cache') and cache.redis_cache:
            cache.redis_cache.set("health_check", "ok", expire=10)
            if cache.redis_cache.get("health_check") == "ok":
                health_status["components"]["cache"] = "healthy"
            else:
                health_status["components"]["cache"] = "unhealthy: read/write failed"
        else:
            health_status["components"]["cache"] = "not configured"
    except Exception as e:
        health_status["status"] = "degraded"
        health_status["components"]["cache"] = f"unhealthy: {str(e)}"

    # Check scheduler
    global scheduler
    if scheduler and scheduler.running:
        health_status["components"]["scheduler"] = "healthy"
    else:
        health_status["status"] = "degraded"
        health_status["components"]["scheduler"] = "unhealthy: not running"

    # Check search engine
    global search_engine
    if search_engine:
        try:
            # Verify FTS is available
            if isinstance(search_engine, FullTextSearchEngine):
                health_status["components"]["search"] = "healthy (FTS enabled)"
            else:
                health_status["components"]["search"] = "healthy (fallback mode)"
        except:
            health_status["status"] = "degraded"
            health_status["components"]["search"] = "unhealthy"
    else:
        health_status["status"] = "degraded"
        health_status["components"]["search"] = "unhealthy: not initialized"

    # Set appropriate status code
    status_code = (
        status.HTTP_200_OK
        if health_status["status"] == "ok"
        else status.HTTP_503_SERVICE_UNAVAILABLE
    )

    return JSONResponse(content=health_status, status_code=status_code)


@app.get("/metrics")
async def performance_metrics():
    """
    Get performance metrics and statistics.
    
    Returns:
        Performance metrics including request stats, query stats, and system resources
    """
    from .monitoring.metrics import collect_metrics
    
    metrics = await collect_metrics()
    return JSONResponse(content=metrics)


@app.get("/api/performance")
async def performance_dashboard():
    """
    Get detailed performance dashboard data.
    
    Returns:
        Detailed performance statistics for monitoring
    """
    stats = performance_monitor.get_stats()
    
    # Add current system metrics
    import psutil
    stats['current_system'] = {
        'cpu_percent': psutil.cpu_percent(interval=0.1),
        'memory': dict(psutil.virtual_memory()._asdict()),
        'disk': dict(psutil.disk_usage('/')._asdict()),
        'network': dict(psutil.net_io_counters()._asdict()) if psutil.net_io_counters() else None,
    }
    
    # Add database query suggestions
    stats['optimization_suggestions'] = {
        'slow_queries': performance_monitor.get_slow_queries(5),
        'frequent_queries': performance_monitor.get_frequent_queries(5),
    }
    
    return JSONResponse(content=stats)
