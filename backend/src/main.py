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
from .db.session import get_db, init_db
from .api import api_router
from .middleware import setup_middleware
from .errors import (
    BetterManError,
    betterman_error_handler,
    validation_error_handler,
    http_exception_handler,
    generic_exception_handler,
)

# Initialize settings and logging
settings = get_settings()
setup_logging(settings)
logger = logging.getLogger(__name__)

# Import scheduler-related functions
from .jobs.simple_scheduler import get_scheduler


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

        # Initialize database
        logger.info("Initializing database...")
        init_db()

        # Initialize scheduler
        logger.info("Initializing scheduler...")
        scheduler = get_scheduler(settings.DATABASE_URL)
        if not scheduler.running:
            scheduler.start()
        logger.info("Scheduler initialized successfully")

        # Initialize search engine
        try:
            from .search.search_engine import SearchEngine

            db = next(get_db())
            search_engine = SearchEngine(db)
            logger.info("Search engine initialized")
        except Exception as e:
            logger.error(f"Error initializing search engine: {e}")

        logger.info(f"BetterMan API started in {settings.ENVIRONMENT} mode")

    except Exception as e:
        logger.error(f"Startup error: {e}")
        raise

    yield

    # Shutdown
    try:
        logger.info("Shutting down BetterMan API...")

        # Shutdown scheduler
        if scheduler and scheduler.running:
            scheduler.stop()
            logger.info("Scheduler shut down")

        # Cleanup search engine
        if search_engine:
            # Add any cleanup if needed
            pass

        logger.info("BetterMan API stopped")

    except Exception as e:
        logger.error(f"Shutdown error: {e}")


# Create FastAPI app with lifespan
app = FastAPI(
    title=settings.APP_NAME,
    description="Modern interface for Linux documentation with advanced search and caching",
    version=settings.APP_VERSION,
    lifespan=lifespan,
    docs_url="/api/docs" if settings.DEBUG else None,
    redoc_url="/api/redoc" if settings.DEBUG else None,
    openapi_url="/api/openapi.json" if settings.DEBUG else None,
)

# Setup middleware
setup_middleware(app)

# Setup security
from .security import setup_security

setup_security(app)

# Setup monitoring
from .monitoring import setup_monitoring

setup_monitoring(app)

# Setup performance optimizations
from .performance import setup_performance_monitoring, CompressionMiddleware

setup_performance_monitoring()

# Add compression middleware
app.add_middleware(CompressionMiddleware)

# Add exception handlers
app.add_exception_handler(BetterManError, betterman_error_handler)
app.add_exception_handler(RequestValidationError, validation_error_handler)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(Exception, generic_exception_handler)

# Include API routes
app.include_router(api_router, prefix=settings.API_PREFIX)


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
            if hasattr(search_engine, "has_fts") and search_engine.has_fts:
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
