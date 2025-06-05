"""
Enhanced middleware for request processing, logging, and security.
"""

import time
import uuid
import logging
import secrets
import hashlib
from typing import Callable, Optional, Set
from fastapi import Request, Response, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from ..config import get_settings
from ..cache.cache_manager import get_cache_manager

logger = logging.getLogger(__name__)


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Add unique request ID to each request."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Generate or extract request ID
        request_id = request.headers.get("X-Request-ID")
        if not request_id or len(request_id) > 128:
            request_id = str(uuid.uuid4())

        request.state.request_id = request_id

        # Process request
        response = await call_next(request)

        # Add request ID to response
        response.headers["X-Request-ID"] = request_id

        return response


class LoggingMiddleware(BaseHTTPMiddleware):
    """Enhanced logging with privacy protection."""

    def __init__(self, app: ASGIApp):
        super().__init__(app)
        self.sensitive_paths = {
            "/auth/login",
            "/auth/register",
            "/auth/change-password",
        }
        self.sensitive_headers = {"authorization", "x-api-key", "cookie", "set-cookie"}

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        start_time = time.time()

        # Get request details
        request_id = getattr(request.state, "request_id", "unknown")

        # Sanitize sensitive data
        sanitized_headers = {
            k: v if k.lower() not in self.sensitive_headers else "[REDACTED]"
            for k, v in request.headers.items()
        }

        # Log request
        logger.info(
            f"Request started: {request.method} {request.url.path}",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "query_params": (
                    dict(request.query_params)
                    if request.url.path not in self.sensitive_paths
                    else "[REDACTED]"
                ),
                "client_host": (
                    self._hash_ip(request.client.host) if request.client else None
                ),
                "user_agent": request.headers.get("User-Agent"),
            },
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
                },
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
                },
                exc_info=True,
            )
            raise

    def _hash_ip(self, ip: str) -> str:
        """Hash IP for privacy."""
        if not ip:
            return "unknown"
        salt = get_settings().SECRET_KEY.encode()
        return hashlib.sha256(salt + ip.encode()).hexdigest()[:16]


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Enhanced security headers with CSP nonce support."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Generate CSP nonce
        csp_nonce = secrets.token_urlsafe(16)
        request.state.csp_nonce = csp_nonce

        response = await call_next(request)

        # Add security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "geolocation=(), microphone=(), camera=()"
        )

        # Add HSTS for production
        settings = get_settings()
        if settings.ENVIRONMENT == "production":
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains; preload"
            )

        # Enhanced CSP with nonce
        csp_directives = [
            "default-src 'self'",
            f"script-src 'self' 'nonce-{csp_nonce}'",
            "style-src 'self' 'unsafe-inline'",  # Allow inline styles for now
            "img-src 'self' data: https:",
            "font-src 'self' data:",
            "connect-src 'self'",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "upgrade-insecure-requests",
        ]

        response.headers["Content-Security-Policy"] = "; ".join(csp_directives)

        return response


class CSRFMiddleware(BaseHTTPMiddleware):
    """CSRF protection for state-changing operations."""

    def __init__(self, app: ASGIApp):
        super().__init__(app)
        self.safe_methods = {"GET", "HEAD", "OPTIONS"}
        self.excluded_paths = {"/docs", "/openapi.json", "/health"}

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip CSRF for safe methods
        if request.method in self.safe_methods:
            return await call_next(request)

        # Skip excluded paths
        if request.url.path in self.excluded_paths:
            return await call_next(request)

        # Check CSRF token for state-changing operations
        csrf_token = request.headers.get("X-CSRF-Token")
        if not csrf_token:
            # Try to get from form data
            if request.headers.get("content-type", "").startswith(
                "application/x-www-form-urlencoded"
            ):
                form = await request.form()
                csrf_token = form.get("csrf_token")

        # Validate CSRF token
        if not self._validate_csrf_token(request, csrf_token):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid or missing CSRF token",
            )

        # Process request
        response = await call_next(request)

        # Set CSRF cookie for future requests
        if request.method == "GET":
            csrf_token = self._generate_csrf_token()
            response.set_cookie(
                key="csrf_token",
                value=csrf_token,
                httponly=True,
                secure=True,
                samesite="strict",
                max_age=3600,  # 1 hour
            )

        return response

    def _generate_csrf_token(self) -> str:
        """Generate secure CSRF token."""
        return secrets.token_urlsafe(32)

    def _validate_csrf_token(self, request: Request, token: Optional[str]) -> bool:
        """Validate CSRF token against cookie."""
        if not token:
            return False

        # Get token from cookie
        cookie_token = request.cookies.get("csrf_token")
        if not cookie_token:
            return False

        # Constant-time comparison
        return secrets.compare_digest(token, cookie_token)


class CacheControlMiddleware(BaseHTTPMiddleware):
    """Enhanced cache control with security considerations."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)

        # Never cache authenticated responses
        if "authorization" in request.headers or "x-api-key" in request.headers:
            response.headers["Cache-Control"] = "no-store, private"
            return response

        # Cache static content
        if request.url.path.startswith("/static"):
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"

        # Cache API responses based on method and path
        elif request.url.path.startswith("/api"):
            if request.method == "GET":
                if "/search" in request.url.path:
                    response.headers["Cache-Control"] = (
                        "public, max-age=300, stale-while-revalidate=600"
                    )
                elif "/documents" in request.url.path:
                    response.headers["Cache-Control"] = (
                        "public, max-age=3600, stale-while-revalidate=7200"
                    )
                else:
                    response.headers["Cache-Control"] = "public, max-age=600"
            else:
                response.headers["Cache-Control"] = "no-store"

        # Don't cache auth endpoints
        elif request.url.path.startswith("/auth"):
            response.headers["Cache-Control"] = "no-store, private"

        return response


class CompressionMiddleware(BaseHTTPMiddleware):
    """Response compression for better performance."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Temporarily disable compression to fix encoding issues
        # Just pass through the response without modification
        response = await call_next(request)
        return response


def setup_middleware(app: ASGIApp) -> None:
    """
    Configure all middleware for the application.

    Args:
        app: FastAPI application instance
    """
    settings = get_settings()
    
    # Import error handler here to avoid circular imports
    from .error_handler import ErrorHandlerMiddleware

    # Add middleware in order (applied in reverse)
    
    # Error handler (outermost - catches all errors)
    app.add_middleware(ErrorHandlerMiddleware)

    # Compression
    app.add_middleware(CompressionMiddleware)

    # Security headers
    app.add_middleware(SecurityHeadersMiddleware)

    # CSRF protection
    if settings.ENVIRONMENT == "production":
        app.add_middleware(CSRFMiddleware)

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
        allow_headers=settings.CORS_HEADERS.split(",")
        + ["X-CSRF-Token", "X-Request-ID"],
        expose_headers=["X-Request-ID", "X-Response-Time", "X-RateLimit-*"],
    )

    # Trusted hosts for production
    if settings.ENVIRONMENT == "production":
        allowed_hosts = (
            settings.ALLOWED_HOSTS.split(",") if settings.ALLOWED_HOSTS else ["*"]
        )
        app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed_hosts)

    logger.info("Enhanced middleware configured successfully")
