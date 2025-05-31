"""
Security utilities and middleware for BetterMan.
"""

import re
import secrets
import hashlib
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from fastapi import Request, Response, HTTPException, status
from fastapi.security import APIKeyHeader, HTTPBearer, HTTPAuthorizationCredentials
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from .config import get_settings
from .errors import RateLimitError, ValidationError

settings = get_settings()


# Rate limiter instance
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[settings.RATE_LIMIT_DEFAULT],
    enabled=settings.RATE_LIMIT_ENABLED
)


class SecurityUtils:
    """Security utility functions."""
    
    @staticmethod
    def sanitize_input(value: str, max_length: int = 1000) -> str:
        """
        Sanitize user input to prevent injection attacks.
        
        Args:
            value: Input string to sanitize
            max_length: Maximum allowed length
            
        Returns:
            Sanitized string
        """
        if not value:
            return ""
        
        # Truncate to max length
        value = value[:max_length]
        
        # Remove null bytes
        value = value.replace('\x00', '')
        
        # Remove control characters except newlines and tabs
        value = ''.join(
            char for char in value 
            if char == '\n' or char == '\t' or not ord(char) < 32
        )
        
        return value.strip()
    
    @staticmethod
    def validate_command_name(name: str) -> bool:
        """
        Validate command name to prevent path traversal.
        
        Args:
            name: Command name to validate
            
        Returns:
            True if valid, False otherwise
        """
        if not name:
            return False
        
        # Only allow alphanumeric, dash, underscore, and dot
        if not re.match(r'^[a-zA-Z0-9._-]+$', name):
            return False
        
        # Prevent path traversal
        if '..' in name or '/' in name or '\\' in name:
            return False
        
        # Reasonable length limit
        if len(name) > 100:
            return False
        
        return True
    
    @staticmethod
    def validate_search_query(query: str) -> str:
        """
        Validate and sanitize search query.
        
        Args:
            query: Search query to validate
            
        Returns:
            Sanitized query
            
        Raises:
            ValidationError: If query is invalid
        """
        # Basic sanitization
        query = SecurityUtils.sanitize_input(query, max_length=200)
        
        if not query or len(query) < 1:
            raise ValidationError(
                "Query must be at least 1 character",
                field="query"
            )
        
        # Check for regex DOS patterns
        dangerous_patterns = [
            r'(\w+\+)+',  # Exponential backtracking
            r'(a+)+b',    # Catastrophic backtracking
            r'(\d+)*\d+', # Nested quantifiers
        ]
        
        for pattern in dangerous_patterns:
            if re.search(pattern, query, re.IGNORECASE):
                raise ValidationError(
                    "Query contains potentially dangerous pattern",
                    field="query"
                )
        
        return query
    
    @staticmethod
    def hash_ip_address(ip: str) -> str:
        """
        Hash IP address for privacy-preserving analytics.
        
        Args:
            ip: IP address to hash
            
        Returns:
            Hashed IP address
        """
        if not ip:
            return "anonymous"
        
        # Add salt for additional privacy
        salt = settings.APP_NAME.encode('utf-8')
        return hashlib.sha256(salt + ip.encode('utf-8')).hexdigest()[:16]


class APIKeyValidator:
    """API key validation for optional authentication."""
    
    def __init__(self):
        self.api_key_header = APIKeyHeader(
            name="X-API-Key",
            auto_error=False
        )
    
    async def __call__(self, request: Request) -> Optional[str]:
        """
        Validate API key if provided.
        
        Args:
            request: FastAPI request
            
        Returns:
            API key if valid, None if not provided
            
        Raises:
            HTTPException: If API key is invalid
        """
        api_key = await self.api_key_header(request)
        
        if not api_key:
            return None
        
        # In production, validate against database or cache
        # For now, we'll use a simple check
        if not self._validate_api_key(api_key):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid API key"
            )
        
        return api_key
    
    def _validate_api_key(self, api_key: str) -> bool:
        """Validate API key format and existence."""
        # Basic format validation
        if not re.match(r'^[a-zA-Z0-9]{32,64}$', api_key):
            return False
        
        # TODO: Check against database
        # For now, accept any properly formatted key
        return True


class ContentSecurityPolicy:
    """Content Security Policy management."""
    
    DEFAULT_POLICY = {
        "default-src": ["'self'"],
        "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", "data:", "https:"],
        "font-src": ["'self'", "data:"],
        "connect-src": ["'self'"],
        "frame-ancestors": ["'none'"],
        "base-uri": ["'self'"],
        "form-action": ["'self'"],
    }
    
    @classmethod
    def generate_policy(cls, additions: Optional[Dict[str, List[str]]] = None) -> str:
        """
        Generate CSP header value.
        
        Args:
            additions: Additional directives to merge
            
        Returns:
            CSP header string
        """
        policy = cls.DEFAULT_POLICY.copy()
        
        # Merge additional directives
        if additions:
            for directive, values in additions.items():
                if directive in policy:
                    policy[directive].extend(values)
                else:
                    policy[directive] = values
        
        # Build policy string
        parts = []
        for directive, values in policy.items():
            parts.append(f"{directive} {' '.join(values)}")
        
        return "; ".join(parts)


def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> Response:
    """
    Custom rate limit exceeded handler.
    
    Args:
        request: FastAPI request
        exc: Rate limit exception
        
    Returns:
        JSON response with rate limit error
    """
    # Extract rate limit info
    limit = getattr(exc, "detail", "Rate limit exceeded")
    
    # Calculate retry after
    retry_after = 60  # Default to 60 seconds
    
    response = Response(
        content={
            "error": {
                "message": f"Rate limit exceeded: {limit}",
                "status_code": status.HTTP_429_TOO_MANY_REQUESTS,
                "details": {
                    "limit": limit,
                    "retry_after": retry_after
                }
            }
        },
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        headers={
            "Retry-After": str(retry_after),
            "X-RateLimit-Limit": str(limit),
        }
    )
    
    return response


def setup_security(app):
    """
    Configure security settings for the application.
    
    Args:
        app: FastAPI application instance
    """
    # Add rate limiting
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, rate_limit_handler)


class InputValidator:
    """Input validation utilities."""
    
    @staticmethod
    def validate_pagination(page: int, per_page: int) -> tuple[int, int]:
        """
        Validate pagination parameters.
        
        Args:
            page: Page number
            per_page: Items per page
            
        Returns:
            Validated (offset, limit) tuple
        """
        # Ensure positive values
        page = max(1, page)
        per_page = max(1, min(per_page, settings.SEARCH_MAX_RESULTS))
        
        offset = (page - 1) * per_page
        
        # Prevent deep pagination attacks
        max_offset = 10000
        if offset > max_offset:
            raise ValidationError(
                f"Cannot paginate beyond {max_offset} results",
                field="page"
            )
        
        return offset, per_page
    
    @staticmethod
    def validate_section(section: Optional[int]) -> Optional[int]:
        """
        Validate man page section number.
        
        Args:
            section: Section number
            
        Returns:
            Validated section or None
        """
        if section is None:
            return None
        
        valid_sections = [1, 2, 3, 4, 5, 6, 7, 8]
        if section not in valid_sections:
            raise ValidationError(
                f"Invalid section: {section}. Must be one of {valid_sections}",
                field="section"
            )
        
        return section