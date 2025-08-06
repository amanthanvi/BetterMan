"""
Enhanced rate limiting with multiple strategies to prevent bypass.
"""

import time
import hashlib
import ipaddress
from typing import Optional, Dict, Any, Tuple
from datetime import datetime, timedelta
from fastapi import Request, HTTPException, status
from sqlalchemy.orm import Session
import json

from ..cache.cache_manager import CacheManager
from ..config import get_settings
from ..models.user import User
import logging

logger = logging.getLogger(__name__)
settings = get_settings()


class RateLimitStrategy:
    """Base rate limit strategy."""
    
    def get_identifier(self, request: Request, user: Optional[User] = None) -> str:
        """Get unique identifier for rate limiting."""
        raise NotImplementedError
    
    def get_limit_key(self, identifier: str, window: str) -> str:
        """Get cache key for rate limit."""
        return f"rate_limit:{self.__class__.__name__}:{identifier}:{window}"


class IPRateLimitStrategy(RateLimitStrategy):
    """Rate limit by IP address."""
    
    def get_identifier(self, request: Request, user: Optional[User] = None) -> str:
        """Get client IP address."""
        # Get real IP, checking various headers
        forwarded_for = request.headers.get("X-Forwarded-For")
        real_ip = request.headers.get("X-Real-IP")
        
        if forwarded_for:
            # Take the first IP from the chain
            ip = forwarded_for.split(",")[0].strip()
        elif real_ip:
            ip = real_ip
        else:
            ip = request.client.host if request.client else "unknown"
        
        # Validate IP address
        try:
            ipaddress.ip_address(ip)
            return ip
        except ValueError:
            logger.warning(f"Invalid IP address: {ip}")
            return "invalid_ip"


class UserRateLimitStrategy(RateLimitStrategy):
    """Rate limit by authenticated user."""
    
    def get_identifier(self, request: Request, user: Optional[User] = None) -> str:
        """Get user identifier."""
        if user:
            return f"user:{user.id}"
        return "anonymous"


class SessionRateLimitStrategy(RateLimitStrategy):
    """Rate limit by session fingerprint."""
    
    def get_identifier(self, request: Request, user: Optional[User] = None) -> str:
        """Get session fingerprint based on multiple factors."""
        components = []
        
        # User agent
        user_agent = request.headers.get("User-Agent", "")
        components.append(user_agent)
        
        # Accept headers
        accept = request.headers.get("Accept", "")
        accept_language = request.headers.get("Accept-Language", "")
        accept_encoding = request.headers.get("Accept-Encoding", "")
        components.extend([accept, accept_language, accept_encoding])
        
        # Additional headers
        dnt = request.headers.get("DNT", "")
        components.append(dnt)
        
        # Create fingerprint
        fingerprint = hashlib.sha256("|".join(components).encode()).hexdigest()[:16]
        return f"session:{fingerprint}"


class PathRateLimitStrategy(RateLimitStrategy):
    """Rate limit by API path."""
    
    def get_identifier(self, request: Request, user: Optional[User] = None) -> str:
        """Get path identifier."""
        path = request.url.path
        method = request.method
        return f"path:{method}:{path}"


class EnhancedRateLimiter:
    """Enhanced rate limiter with multiple strategies."""
    
    def __init__(self, cache: CacheManager):
        self.cache = cache
        self.strategies = [
            IPRateLimitStrategy(),
            UserRateLimitStrategy(),
            SessionRateLimitStrategy(),
            PathRateLimitStrategy()
        ]
    
    async def check_rate_limit(
        self,
        request: Request,
        user: Optional[User] = None,
        limit: int = 100,
        window: int = 3600,
        burst: int = 10
    ) -> Dict[str, Any]:
        """
        Check rate limits using multiple strategies.
        
        Args:
            request: FastAPI request
            user: Authenticated user (if any)
            limit: Requests allowed per window
            window: Time window in seconds
            burst: Burst allowance
            
        Returns:
            Rate limit info
            
        Raises:
            HTTPException: If rate limit exceeded
        """
        current_time = int(time.time())
        window_start = current_time - (current_time % window)
        window_key = f"{window_start}:{window}"
        
        # Check each strategy
        for strategy in self.strategies:
            identifier = strategy.get_identifier(request, user)
            
            # Skip invalid identifiers
            if identifier in ["unknown", "invalid_ip", "anonymous"] and not isinstance(strategy, UserRateLimitStrategy):
                continue
            
            # Get current count
            key = strategy.get_limit_key(identifier, window_key)
            current_count = self.cache.get(key) or 0
            
            # Check if exceeded
            effective_limit = limit
            if isinstance(strategy, UserRateLimitStrategy) and user:
                # Authenticated users get higher limits
                effective_limit = limit * 2
            
            if current_count >= effective_limit:
                # Check burst allowance
                burst_key = f"{key}:burst"
                burst_count = self.cache.get(burst_key) or 0
                
                if burst_count >= burst:
                    self._raise_rate_limit_error(
                        strategy.__class__.__name__,
                        effective_limit,
                        window,
                        current_count
                    )
                else:
                    # Use burst allowance
                    self.cache.increment(burst_key, ttl=300)  # 5 minute burst window
            
            # Increment counter
            self.cache.increment(key, ttl=window)
        
        # Calculate remaining requests (based on most restrictive)
        remaining = float('inf')
        for strategy in self.strategies:
            identifier = strategy.get_identifier(request, user)
            key = strategy.get_limit_key(identifier, window_key)
            current_count = self.cache.get(key) or 0
            
            effective_limit = limit
            if isinstance(strategy, UserRateLimitStrategy) and user:
                effective_limit = limit * 2
            
            strategy_remaining = max(0, effective_limit - current_count)
            remaining = min(remaining, strategy_remaining)
        
        return {
            "limit": limit,
            "remaining": int(remaining),
            "reset": window_start + window,
            "window": window
        }
    
    def _raise_rate_limit_error(
        self,
        strategy: str,
        limit: int,
        window: int,
        current: int
    ):
        """Raise rate limit error with details."""
        reset_time = datetime.utcnow() + timedelta(seconds=window)
        
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": "Rate limit exceeded",
                "strategy": strategy,
                "limit": limit,
                "current": current,
                "window": window,
                "reset": reset_time.isoformat()
            },
            headers={
                "Retry-After": str(window),
                "X-RateLimit-Limit": str(limit),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Reset": str(int(reset_time.timestamp()))
            }
        )
    
    async def check_endpoint_limit(
        self,
        request: Request,
        endpoint: str,
        user: Optional[User] = None
    ) -> Dict[str, Any]:
        """Check rate limit for specific endpoint."""
        # Define endpoint-specific limits
        endpoint_limits = {
            "/api/search": (100, 3600, 20),      # 100/hour, burst 20
            "/api/documents": (1000, 3600, 100),  # 1000/hour, burst 100
            "/auth/login": (5, 300, 2),           # 5/5min, burst 2
            "/auth/register": (3, 3600, 1),       # 3/hour, burst 1
            "/api/parse": (50, 3600, 10),         # 50/hour, burst 10
        }
        
        # Get limits for endpoint
        limit, window, burst = endpoint_limits.get(
            endpoint,
            (100, 3600, 10)  # Default limits
        )
        
        return await self.check_rate_limit(
            request,
            user,
            limit=limit,
            window=window,
            burst=burst
        )
    
    def add_rate_limit_headers(
        self,
        response: Any,
        rate_limit_info: Dict[str, Any]
    ):
        """Add rate limit headers to response."""
        response.headers["X-RateLimit-Limit"] = str(rate_limit_info["limit"])
        response.headers["X-RateLimit-Remaining"] = str(rate_limit_info["remaining"])
        response.headers["X-RateLimit-Reset"] = str(rate_limit_info["reset"])
        response.headers["X-RateLimit-Window"] = str(rate_limit_info["window"])


class RateLimitMiddleware:
    """Rate limiting middleware."""
    
    def __init__(self, cache: CacheManager):
        self.limiter = EnhancedRateLimiter(cache)
        self.excluded_paths = [
            "/health",
            "/metrics",
            "/docs",
            "/openapi.json",
            "/favicon.ico"
        ]
    
    async def __call__(self, request: Request, call_next):
        """Apply rate limiting to requests."""
        # Skip excluded paths
        if request.url.path in self.excluded_paths:
            return await call_next(request)
        
        # Get user if authenticated
        user = getattr(request.state, "user", None)
        
        # Check rate limit
        try:
            rate_limit_info = await self.limiter.check_endpoint_limit(
                request,
                request.url.path,
                user
            )
        except HTTPException as e:
            # Return rate limit error response
            return JSONResponse(
                status_code=e.status_code,
                content=e.detail,
                headers=e.headers
            )
        
        # Process request
        response = await call_next(request)
        
        # Add rate limit headers
        self.limiter.add_rate_limit_headers(response, rate_limit_info)
        
        return response


from fastapi.responses import JSONResponse