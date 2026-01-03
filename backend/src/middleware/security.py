"""
Enhanced security middleware for production-grade protection.
"""

import time
import hashlib
import secrets
import ipaddress
from datetime import datetime, timedelta
from typing import Optional, Dict, Set, Tuple, Any
from collections import defaultdict
import logging
from fastapi import Request, Response, HTTPException, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.cors import CORSMiddleware
import user_agents

from ..config_v2 import get_settings
from ..cache.redis_cache import redis_cache

logger = logging.getLogger(__name__)
settings = get_settings()


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add comprehensive security headers to all responses."""
    
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        
        # Basic security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        
        # HSTS (HTTP Strict Transport Security)
        if settings.ENVIRONMENT.value == "production":
            response.headers["Strict-Transport-Security"] = f"max-age={settings.HSTS_MAX_AGE}; includeSubDomains; preload"
        
        # CSP (Content Security Policy)
        csp_directives = [
            "default-src 'self'",
            "script-src 'self' 'unsafe-eval' https://cdn.jsdelivr.net",  # Remove unsafe-eval in production
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' data: https://fonts.gstatic.com",
            "img-src 'self' data: https:",
            "connect-src 'self' https://api.github.com https://api.openai.com",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "upgrade-insecure-requests"
        ]
        response.headers["Content-Security-Policy"] = "; ".join(csp_directives)
        
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Advanced rate limiting with multiple strategies."""
    
    def __init__(self, app):
        super().__init__(app)
        self.cache = redis_cache if redis_cache.is_available() else None
        self.local_cache: Dict[str, Dict[str, Any]] = defaultdict(dict)
        
    def get_client_id(self, request: Request) -> str:
        """Get unique client identifier."""
        # Try to get authenticated user ID first
        if hasattr(request.state, "user") and request.state.user:
            return f"user:{request.state.user.id}"
        
        # Fall back to IP address
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            client_ip = forwarded_for.split(",")[0].strip()
        else:
            client_ip = request.client.host
        
        return f"ip:{client_ip}"
    
    async def check_rate_limit(
        self, 
        client_id: str, 
        endpoint: str,
        limits: Dict[str, Tuple[int, int]]  # {endpoint: (requests, window_seconds)}
    ) -> bool:
        """Check if client has exceeded rate limit."""
        current_time = time.time()
        
        # Get specific limit for endpoint or default
        limit, window = limits.get(endpoint, (settings.RATE_LIMIT_PER_MINUTE, 60))
        
        cache_key = f"ratelimit:{client_id}:{endpoint}"
        
        if self.cache:
            # Use Redis for distributed rate limiting
            try:
                pipe = self.cache.client.pipeline()
                pipe.zadd(cache_key, {str(current_time): current_time})
                pipe.zremrangebyscore(cache_key, 0, current_time - window)
                pipe.zcard(cache_key)
                pipe.expire(cache_key, window)
                results = pipe.execute()
                request_count = results[2]
                return request_count <= limit
            except Exception as e:
                logger.error(f"Redis rate limit error: {e}")
                # Fall back to local cache
        
        # Local rate limiting
        requests = self.local_cache[cache_key]
        
        # Clean old requests
        requests = {
            timestamp: True 
            for timestamp in requests 
            if float(timestamp) > current_time - window
        }
        
        # Add current request
        requests[str(current_time)] = True
        self.local_cache[cache_key] = requests
        
        return len(requests) <= limit
    
    async def dispatch(self, request: Request, call_next):
        if not settings.RATE_LIMIT_ENABLED:
            return await call_next(request)
        
        client_id = self.get_client_id(request)
        endpoint = f"{request.method}:{request.url.path}"
        
        # Define endpoint-specific limits
        limits = {
            "POST:/api/v2/auth/login": (5, 300),  # 5 per 5 minutes
            "POST:/api/v2/auth/register": (3, 3600),  # 3 per hour
            "GET:/api/v2/search": (60, 60),  # 60 per minute
            "POST:/api/v2/documents/parse": (10, 60),  # 10 per minute
        }
        
        if not await self.check_rate_limit(client_id, endpoint, limits):
            logger.warning(f"Rate limit exceeded for {client_id} on {endpoint}")
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "detail": "Rate limit exceeded. Please try again later.",
                    "retry_after": 60
                },
                headers={"Retry-After": "60"}
            )
        
        response = await call_next(request)
        
        # Add rate limit headers
        response.headers["X-RateLimit-Limit"] = str(settings.RATE_LIMIT_PER_MINUTE)
        response.headers["X-RateLimit-Remaining"] = "0"  # Calculate actual remaining
        response.headers["X-RateLimit-Reset"] = str(int(time.time() + 60))
        
        return response


class RequestValidationMiddleware(BaseHTTPMiddleware):
    """Validate and sanitize incoming requests."""
    
    def __init__(self, app):
        super().__init__(app)
        self.blocked_paths = {
            "/.env", "/.git", "/wp-admin", "/phpmyadmin",
            "/.aws", "/.ssh", "/config", "/.htaccess"
        }
        self.blocked_user_agents = {
            "bot", "crawler", "spider", "scraper", "wget", "curl"
        }
        
    def is_valid_host(self, host: str) -> bool:
        """Validate host header."""
        if settings.ALLOWED_HOSTS == ["*"]:
            return True
        
        allowed_hosts = settings.parse_allowed_hosts(settings.ALLOWED_HOSTS)
        return host in allowed_hosts
    
    def is_blocked_path(self, path: str) -> bool:
        """Check if path is blocked."""
        path_lower = path.lower()
        return any(blocked in path_lower for blocked in self.blocked_paths)
    
    def is_blocked_user_agent(self, user_agent: str) -> bool:
        """Check if user agent is blocked."""
        if not user_agent:
            return False
        
        ua_lower = user_agent.lower()
        
        # Allow legitimate bots
        if any(good_bot in ua_lower for good_bot in ["googlebot", "bingbot"]):
            return False
        
        return any(blocked in ua_lower for blocked in self.blocked_user_agents)
    
    async def dispatch(self, request: Request, call_next):
        # Validate host header
        host = request.headers.get("host", "")
        if not self.is_valid_host(host.split(":")[0]):
            logger.warning(f"Invalid host header: {host}")
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={"detail": "Invalid host header"}
            )
        
        # Check blocked paths
        if self.is_blocked_path(request.url.path):
            logger.warning(f"Blocked path access attempt: {request.url.path}")
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={"detail": "Access denied"}
            )
        
        # Check user agent
        user_agent = request.headers.get("user-agent", "")
        if self.is_blocked_user_agent(user_agent):
            logger.warning(f"Blocked user agent: {user_agent}")
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={"detail": "Access denied"}
            )
        
        # Validate content length
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > settings.REQUEST_MAX_SIZE:
            return JSONResponse(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                content={"detail": "Request body too large"}
            )
        
        # Add request ID for tracking
        request_id = request.headers.get("X-Request-ID", secrets.token_urlsafe(16))
        request.state.request_id = request_id
        
        # Parse user agent for device info
        ua = user_agents.parse(user_agent)
        request.state.device_info = {
            "device_type": "mobile" if ua.is_mobile else "tablet" if ua.is_tablet else "desktop",
            "browser": ua.browser.family if ua.browser.family else "Unknown",
            "os": ua.os.family if ua.os.family else "Unknown",
        }
        
        response = await call_next(request)
        
        # Add request ID to response
        response.headers["X-Request-ID"] = request_id
        
        return response


class IPBlockingMiddleware(BaseHTTPMiddleware):
    """Block malicious IPs and implement geo-blocking."""
    
    def __init__(self, app):
        super().__init__(app)
        self.blocked_ips: Set[str] = set()
        self.blocked_countries: Set[str] = set()  # ISO country codes
        self.whitelist_ips: Set[str] = {"127.0.0.1", "::1"}  # Always allow localhost
        
    def is_ip_blocked(self, ip: str) -> bool:
        """Check if IP is blocked."""
        try:
            # Check whitelist first
            if ip in self.whitelist_ips:
                return False
            
            # Check direct IP blocks
            if ip in self.blocked_ips:
                return True
            
            # Check IP ranges (simplified example)
            ip_obj = ipaddress.ip_address(ip)
            for blocked_range in ["192.168.0.0/16", "10.0.0.0/8"]:
                if ip_obj in ipaddress.ip_network(blocked_range, strict=False):
                    return True
            
            return False
            
        except ValueError:
            # Invalid IP format
            return True
    
    async def dispatch(self, request: Request, call_next):
        # Get client IP
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            client_ip = forwarded_for.split(",")[0].strip()
        else:
            client_ip = request.client.host
        
        # Check if IP is blocked
        if self.is_ip_blocked(client_ip):
            logger.warning(f"Blocked IP access attempt: {client_ip}")
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={"detail": "Access denied"}
            )
        
        # Add client IP to request state
        request.state.client_ip = client_ip
        
        response = await call_next(request)
        return response


class CSRFProtectionMiddleware(BaseHTTPMiddleware):
    """CSRF protection for state-changing requests."""
    
    def __init__(self, app):
        super().__init__(app)
        self.safe_methods = {"GET", "HEAD", "OPTIONS"}
        self.csrf_header = "X-CSRF-Token"
        self.csrf_cookie = "csrf_token"
        
    def generate_csrf_token(self) -> str:
        """Generate a new CSRF token."""
        return secrets.token_urlsafe(32)
    
    def verify_csrf_token(self, request: Request, token: str) -> bool:
        """Verify CSRF token."""
        # Get token from cookie
        cookie_token = request.cookies.get(self.csrf_cookie)
        if not cookie_token or not token:
            return False
        
        # Constant-time comparison
        return secrets.compare_digest(cookie_token, token)
    
    async def dispatch(self, request: Request, call_next):
        # Skip CSRF for safe methods
        if request.method in self.safe_methods:
            response = await call_next(request)
            
            # Set CSRF cookie if not present
            if self.csrf_cookie not in request.cookies:
                token = self.generate_csrf_token()
                response.set_cookie(
                    key=self.csrf_cookie,
                    value=token,
                    secure=settings.SESSION_COOKIE_SECURE,
                    httponly=True,
                    samesite=settings.SESSION_COOKIE_SAMESITE,
                    max_age=86400  # 24 hours
                )
            
            return response
        
        # Skip CSRF for API endpoints (they use JWT)
        if request.url.path.startswith("/api/"):
            return await call_next(request)
        
        # Verify CSRF token for state-changing requests
        token = request.headers.get(self.csrf_header)
        if not self.verify_csrf_token(request, token):
            logger.warning(f"CSRF token validation failed for {request.url.path}")
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={"detail": "CSRF token validation failed"}
            )
        
        response = await call_next(request)
        return response


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log all requests for audit and debugging."""
    
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        
        # Log request
        logger.info(
            "Request started",
            extra={
                "method": request.method,
                "path": request.url.path,
                "client_ip": getattr(request.state, "client_ip", request.client.host),
                "user_agent": request.headers.get("user-agent"),
                "request_id": getattr(request.state, "request_id", None),
            }
        )
        
        try:
            response = await call_next(request)
            process_time = time.time() - start_time
            
            # Log response
            logger.info(
                "Request completed",
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "status_code": response.status_code,
                    "process_time": round(process_time, 3),
                    "request_id": getattr(request.state, "request_id", None),
                }
            )
            
            # Add processing time header
            response.headers["X-Process-Time"] = str(process_time)
            
            return response
            
        except Exception as e:
            process_time = time.time() - start_time
            logger.error(
                "Request failed",
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "error": str(e),
                    "process_time": round(process_time, 3),
                    "request_id": getattr(request.state, "request_id", None),
                },
                exc_info=True
            )
            raise