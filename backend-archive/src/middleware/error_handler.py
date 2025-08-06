"""
Enhanced error handling middleware with detailed logging and user-friendly responses.
"""

import time
import traceback
import logging
from typing import Optional, Dict, Any, Callable
from fastapi import Request, Response, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from ..errors import (
    BetterManError,
    NotFoundError,
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    RateLimitError,
    DatabaseError,
    SearchError,
    ParseError,
    CacheError,
)
from ..monitoring_services.error_tracking import error_tracker, ErrorContext
from ..config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class ErrorHandlerMiddleware(BaseHTTPMiddleware):
    """Comprehensive error handling middleware."""
    
    # Error messages for different environments
    GENERIC_ERROR_MESSAGE = "An unexpected error occurred. Please try again later."
    GENERIC_ERROR_MESSAGE_DEV = "An internal server error occurred. Check logs for details."
    
    # Map error types to HTTP status codes
    ERROR_STATUS_MAPPING = {
        NotFoundError: status.HTTP_404_NOT_FOUND,
        ValidationError: status.HTTP_400_BAD_REQUEST,
        AuthenticationError: status.HTTP_401_UNAUTHORIZED,
        AuthorizationError: status.HTTP_403_FORBIDDEN,
        RateLimitError: status.HTTP_429_TOO_MANY_REQUESTS,
        DatabaseError: status.HTTP_503_SERVICE_UNAVAILABLE,
        SearchError: status.HTTP_500_INTERNAL_SERVER_ERROR,
        ParseError: status.HTTP_422_UNPROCESSABLE_ENTITY,
        CacheError: status.HTTP_503_SERVICE_UNAVAILABLE,
    }
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Process request with comprehensive error handling."""
        start_time = time.time()
        request_id = getattr(request.state, "request_id", "unknown")
        
        # Create error context
        error_context = ErrorContext(
            request_id=request_id,
            endpoint=str(request.url.path),
            method=request.method,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            query_params=dict(request.query_params),
            session_id=request.headers.get("x-session-id"),
        )
        
        # Extract user ID if authenticated
        if hasattr(request.state, "user"):
            error_context.user_id = getattr(request.state.user, "id", None)
        
        try:
            response = await call_next(request)
            
            # Log 5xx errors
            if response.status_code >= 500:
                duration = time.time() - start_time
                logger.error(
                    f"Server error response: {response.status_code}",
                    extra={
                        "request_id": request_id,
                        "status_code": response.status_code,
                        "duration_ms": round(duration * 1000, 2),
                        "path": request.url.path,
                    }
                )
            
            return response
            
        except BetterManError as e:
            # Handle known application errors
            return await self._handle_known_error(e, error_context)
            
        except StarletteHTTPException as e:
            # Handle HTTP exceptions
            return await self._handle_http_exception(e, error_context)
            
        except Exception as e:
            # Handle unexpected errors
            return await self._handle_unexpected_error(e, error_context)
    
    async def _handle_known_error(
        self, 
        error: BetterManError, 
        context: ErrorContext
    ) -> JSONResponse:
        """Handle known application errors."""
        status_code = self.ERROR_STATUS_MAPPING.get(
            type(error), 
            status.HTTP_500_INTERNAL_SERVER_ERROR
        )
        
        # Track error
        severity = self._get_error_severity(status_code)
        error_id = error_tracker.track_error(
            error,
            context=context,
            severity=severity,
            tags={
                "error_type": type(error).__name__,
                "status_code": str(status_code),
            }
        )
        
        # Build error response
        error_response = {
            "error": {
                "type": type(error).__name__,
                "message": str(error),
                "status_code": status_code,
                "error_id": error_id,
                "timestamp": time.time(),
            }
        }
        
        # Add field information for validation errors
        if isinstance(error, ValidationError) and hasattr(error, "field"):
            error_response["error"]["field"] = error.field
        
        # Add details in development
        if settings.DEBUG:
            error_response["error"]["details"] = {
                "traceback": traceback.format_exc().split("\n"),
                "context": {
                    "endpoint": context.endpoint,
                    "method": context.method,
                    "request_id": context.request_id,
                }
            }
        
        return JSONResponse(
            status_code=status_code,
            content=error_response,
            headers=self._get_error_headers(error)
        )
    
    async def _handle_http_exception(
        self, 
        error: StarletteHTTPException, 
        context: ErrorContext
    ) -> JSONResponse:
        """Handle HTTP exceptions."""
        # Track 5xx errors
        if error.status_code >= 500:
            error_id = error_tracker.track_error(
                error,
                context=context,
                severity="high" if error.status_code >= 500 else "medium",
                tags={
                    "http_status": str(error.status_code),
                }
            )
        else:
            error_id = None
        
        error_response = {
            "error": {
                "type": "HTTPException",
                "message": error.detail or "HTTP error occurred",
                "status_code": error.status_code,
                "timestamp": time.time(),
            }
        }
        
        if error_id:
            error_response["error"]["error_id"] = error_id
        
        return JSONResponse(
            status_code=error.status_code,
            content=error_response,
            headers=error.headers
        )
    
    async def _handle_unexpected_error(
        self, 
        error: Exception, 
        context: ErrorContext
    ) -> JSONResponse:
        """Handle unexpected errors."""
        # Always track unexpected errors
        error_id = error_tracker.track_error(
            error,
            context=context,
            severity="critical",
            tags={
                "error_type": type(error).__name__,
                "unexpected": "true",
            },
            extra={
                "error_str": str(error),
                "error_repr": repr(error),
            }
        )
        
        # Log critical error
        logger.critical(
            f"Unexpected error: {type(error).__name__} - {str(error)}",
            extra={
                "error_id": error_id,
                "request_id": context.request_id,
                "traceback": traceback.format_exc(),
            },
            exc_info=True
        )
        
        # Build safe error response
        if settings.DEBUG:
            message = f"{self.GENERIC_ERROR_MESSAGE_DEV}: {str(error)}"
            error_response = {
                "error": {
                    "type": type(error).__name__,
                    "message": message,
                    "status_code": status.HTTP_500_INTERNAL_SERVER_ERROR,
                    "error_id": error_id,
                    "timestamp": time.time(),
                    "traceback": traceback.format_exc().split("\n"),
                }
            }
        else:
            error_response = {
                "error": {
                    "type": "InternalServerError",
                    "message": self.GENERIC_ERROR_MESSAGE,
                    "status_code": status.HTTP_500_INTERNAL_SERVER_ERROR,
                    "error_id": error_id,
                    "timestamp": time.time(),
                }
            }
        
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_response,
            headers={
                "X-Error-ID": error_id,
                "Cache-Control": "no-cache, no-store, must-revalidate",
            }
        )
    
    def _get_error_severity(self, status_code: int) -> str:
        """Determine error severity based on status code."""
        if status_code >= 500:
            return "critical"
        elif status_code >= 400:
            return "medium"
        else:
            return "low"
    
    def _get_error_headers(self, error: BetterManError) -> Dict[str, str]:
        """Get additional headers for error responses."""
        headers = {
            "Cache-Control": "no-cache, no-store, must-revalidate",
        }
        
        # Add rate limit headers for rate limit errors
        if isinstance(error, RateLimitError):
            if hasattr(error, "retry_after"):
                headers["Retry-After"] = str(error.retry_after)
            if hasattr(error, "rate_limit"):
                headers["X-RateLimit-Limit"] = str(error.rate_limit)
            if hasattr(error, "rate_limit_remaining"):
                headers["X-RateLimit-Remaining"] = str(error.rate_limit_remaining)
            if hasattr(error, "rate_limit_reset"):
                headers["X-RateLimit-Reset"] = str(error.rate_limit_reset)
        
        return headers


def create_error_response(
    error_type: str,
    message: str,
    status_code: int,
    error_id: Optional[str] = None,
    field: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None
) -> JSONResponse:
    """Create a standardized error response."""
    error_data = {
        "error": {
            "type": error_type,
            "message": message,
            "status_code": status_code,
            "timestamp": time.time(),
        }
    }
    
    if error_id:
        error_data["error"]["error_id"] = error_id
    
    if field:
        error_data["error"]["field"] = field
    
    if details and settings.DEBUG:
        error_data["error"]["details"] = details
    
    return JSONResponse(
        status_code=status_code,
        content=error_data,
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "X-Content-Type-Options": "nosniff",
        }
    )