"""
Middleware for request processing, logging, and security.
"""

import time
import uuid
import logging
from typing import Callable
from fastapi import Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
from .config import get_settings

logger = logging.getLogger(__name__)


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Add unique request ID to each request."""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Generate or extract request ID
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        request.state.request_id = request_id
        
        # Process request
        response = await call_next(request)
        
        # Add request ID to response
        response.headers["X-Request-ID"] = request_id
        
        return response


class LoggingMiddleware(BaseHTTPMiddleware):
    """Log all requests with timing and details."""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        start_time = time.time()
        
        # Get request details
        request_id = getattr(request.state, "request_id", "unknown")
        
        # Log request
        logger.info(
            f"Request started: {request.method} {request.url.path}",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "query_params": dict(request.query_params),
                "client_host": request.client.host if request.client else None,
                "user_agent": request.headers.get("User-Agent"),
            }
        )
        
        # Process request
        try:
            response = await call_next(request)
            duration = time.time() - start_time
            
            # Log response
            logger.info(
                f"Request completed: {request.method} {request.url.path}",
                extra={
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "status_code": response.status_code,
                    "duration_ms": round(duration * 1000, 2),
                }
            )
            
            # Add timing header
            response.headers["X-Response-Time"] = f"{round(duration * 1000, 2)}ms"
            
            return response
            
        except Exception as e:
            duration = time.time() - start_time
            logger.error(
                f"Request failed: {request.method} {request.url.path}",
                extra={
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "duration_ms": round(duration * 1000, 2),
                    "error": str(e),
                }
            )
            raise


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to responses."""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)
        
        # Add security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        
        # Add CSP for production
        settings = get_settings()
        if settings.ENVIRONMENT == "production":
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
                "style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data: https:; "
                "font-src 'self' data:; "
                "connect-src 'self';"
            )
        
        return response


class CacheControlMiddleware(BaseHTTPMiddleware):
    """Add cache control headers based on content type."""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)
        
        # Cache static content
        if request.url.path.startswith("/static"):
            response.headers["Cache-Control"] = "public, max-age=31536000"  # 1 year
        
        # Cache API responses based on method
        elif request.url.path.startswith("/api"):
            if request.method == "GET":
                # Cache GET requests
                if "/search" in request.url.path:
                    response.headers["Cache-Control"] = "public, max-age=300"  # 5 minutes
                elif "/docs" in request.url.path:
                    response.headers["Cache-Control"] = "public, max-age=3600"  # 1 hour
                else:
                    response.headers["Cache-Control"] = "public, max-age=600"  # 10 minutes
            else:
                # Don't cache non-GET requests
                response.headers["Cache-Control"] = "no-store"
        
        return response


def setup_middleware(app: ASGIApp) -> None:
    """
    Configure all middleware for the application.
    
    Args:
        app: FastAPI application instance
    """
    settings = get_settings()
    
    # Add middleware in order (applied in reverse)
    
    # Security headers
    app.add_middleware(SecurityHeadersMiddleware)
    
    # Cache control
    app.add_middleware(CacheControlMiddleware)
    
    # Logging
    app.add_middleware(LoggingMiddleware)
    
    # Request ID
    app.add_middleware(RequestIDMiddleware)
    
    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=settings.CORS_CREDENTIALS,
        allow_methods=settings.CORS_METHODS.split(","),
        allow_headers=settings.CORS_HEADERS.split(","),
    )
    
    # Trusted hosts for production
    if settings.ENVIRONMENT == "production":
        app.add_middleware(
            TrustedHostMiddleware,
            allowed_hosts=["*.betterman.io", "betterman.io", "localhost"]
        )
    
    logger.info("Middleware configured successfully")