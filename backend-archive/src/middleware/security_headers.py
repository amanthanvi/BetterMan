"""
Security headers middleware for enhanced application security.
"""

from fastapi import Request
from fastapi.responses import Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
import hashlib
import secrets
from typing import Dict, Optional
import logging

logger = logging.getLogger(__name__)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add comprehensive security headers to all responses."""
    
    def __init__(
        self,
        app: ASGIApp,
        environment: str = "production",
        csp_directives: Optional[Dict[str, str]] = None,
        enable_hsts: bool = True,
        enable_csp: bool = True,
        enable_permissions_policy: bool = True,
    ):
        super().__init__(app)
        self.environment = environment
        self.enable_hsts = enable_hsts and environment == "production"
        self.enable_csp = enable_csp
        self.enable_permissions_policy = enable_permissions_policy
        
        # Default CSP directives
        self.csp_directives = {
            "default-src": "'self'",
            "script-src": "'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
            "style-src": "'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src": "'self' https://fonts.gstatic.com",
            "img-src": "'self' data: https:",
            "connect-src": "'self' http://localhost:* ws://localhost:*" if environment == "development" 
                          else "'self' https://api.betterman.example.com wss://api.betterman.example.com",
            "frame-ancestors": "'none'",
            "base-uri": "'self'",
            "form-action": "'self'",
            "object-src": "'none'",
            "upgrade-insecure-requests": "",
        }
        
        # Update with custom directives
        if csp_directives:
            self.csp_directives.update(csp_directives)
    
    async def dispatch(self, request: Request, call_next):
        # Generate nonce for inline scripts
        nonce = secrets.token_urlsafe(16)
        request.state.csp_nonce = nonce
        
        # Process request
        response = await call_next(request)
        
        # Add security headers
        self._add_security_headers(response, nonce)
        
        return response
    
    def _add_security_headers(self, response: Response, nonce: str):
        """Add security headers to response."""
        
        # X-Content-Type-Options
        response.headers["X-Content-Type-Options"] = "nosniff"
        
        # X-Frame-Options
        response.headers["X-Frame-Options"] = "DENY"
        
        # X-XSS-Protection (for older browsers)
        response.headers["X-XSS-Protection"] = "1; mode=block"
        
        # Referrer-Policy
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        
        # Permissions-Policy (formerly Feature-Policy)
        if self.enable_permissions_policy:
            permissions = [
                "accelerometer=()",
                "camera=()",
                "geolocation=()",
                "gyroscope=()",
                "magnetometer=()",
                "microphone=()",
                "payment=()",
                "usb=()",
            ]
            response.headers["Permissions-Policy"] = ", ".join(permissions)
        
        # Strict-Transport-Security (HSTS)
        if self.enable_hsts:
            # 1 year max-age with includeSubDomains and preload
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains; preload"
            )
        
        # Content-Security-Policy
        if self.enable_csp:
            # Update script-src with nonce
            csp_directives = self.csp_directives.copy()
            if "script-src" in csp_directives:
                csp_directives["script-src"] = (
                    f"{csp_directives['script-src']} 'nonce-{nonce}'"
                )
            
            # Build CSP header
            csp_parts = []
            for directive, value in csp_directives.items():
                if value:
                    csp_parts.append(f"{directive} {value}")
                else:
                    csp_parts.append(directive)
            
            response.headers["Content-Security-Policy"] = "; ".join(csp_parts)
        
        # Remove sensitive headers
        headers_to_remove = ["Server", "X-Powered-By"]
        for header in headers_to_remove:
            if header in response.headers:
                del response.headers[header]


class CSRFMiddleware(BaseHTTPMiddleware):
    """CSRF protection middleware using double-submit cookie pattern."""
    
    def __init__(
        self,
        app: ASGIApp,
        cookie_name: str = "csrf_token",
        header_name: str = "X-CSRF-Token",
        safe_methods: set = None,
        exclude_paths: set = None,
    ):
        super().__init__(app)
        self.cookie_name = cookie_name
        self.header_name = header_name
        self.safe_methods = safe_methods or {"GET", "HEAD", "OPTIONS", "TRACE"}
        self.exclude_paths = exclude_paths or {"/api/docs", "/api/openapi.json", "/health"}
    
    async def dispatch(self, request: Request, call_next):
        # Skip CSRF check for safe methods
        if request.method in self.safe_methods:
            return await call_next(request)
        
        # Skip CSRF check for excluded paths
        if request.url.path in self.exclude_paths:
            return await call_next(request)
        
        # Get CSRF token from cookie
        cookie_token = request.cookies.get(self.cookie_name)
        
        # Get CSRF token from header
        header_token = request.headers.get(self.header_name)
        
        # Validate CSRF token
        if not cookie_token or not header_token or cookie_token != header_token:
            logger.warning(
                f"CSRF validation failed for {request.method} {request.url.path}"
            )
            return Response(
                content="CSRF validation failed",
                status_code=403,
                headers={"Content-Type": "text/plain"},
            )
        
        # Process request
        response = await call_next(request)
        
        # Set CSRF cookie if not present
        if not cookie_token:
            csrf_token = secrets.token_urlsafe(32)
            response.set_cookie(
                key=self.cookie_name,
                value=csrf_token,
                httponly=True,
                secure=True,
                samesite="strict",
                max_age=3600,  # 1 hour
            )
        
        return response


class SecurityMiddleware(BaseHTTPMiddleware):
    """Combined security middleware with additional protections."""
    
    def __init__(
        self,
        app: ASGIApp,
        max_request_size: int = 10 * 1024 * 1024,  # 10MB
        enable_request_id: bool = True,
    ):
        super().__init__(app)
        self.max_request_size = max_request_size
        self.enable_request_id = enable_request_id
    
    async def dispatch(self, request: Request, call_next):
        # Add request ID for tracing
        if self.enable_request_id:
            request_id = request.headers.get("X-Request-ID", secrets.token_urlsafe(16))
            request.state.request_id = request_id
        
        # Check request size
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > self.max_request_size:
            return Response(
                content="Request entity too large",
                status_code=413,
                headers={"Content-Type": "text/plain"},
            )
        
        # Process request
        response = await call_next(request)
        
        # Add request ID to response
        if self.enable_request_id:
            response.headers["X-Request-ID"] = request.state.request_id
        
        return response