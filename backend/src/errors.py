"""
Custom error handling and exceptions for BetterMan.
"""

import logging
import traceback
from typing import Optional, Dict, Any, Union
from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class BetterManError(Exception):
    """Base exception for BetterMan application."""
    
    def __init__(
        self,
        message: str,
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        details: Optional[Dict[str, Any]] = None
    ):
        self.message = message
        self.status_code = status_code
        self.details = details or {}
        super().__init__(self.message)


class NotFoundError(BetterManError):
    """Resource not found error."""
    
    def __init__(self, resource: str, identifier: Union[str, int]):
        super().__init__(
            message=f"{resource} not found: {identifier}",
            status_code=status.HTTP_404_NOT_FOUND,
            details={"resource": resource, "identifier": str(identifier)}
        )


class ValidationError(BetterManError):
    """Validation error."""
    
    def __init__(self, message: str, field: Optional[str] = None):
        details = {"field": field} if field else {}
        super().__init__(
            message=message,
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            details=details
        )


class DatabaseError(BetterManError):
    """Database operation error."""
    
    def __init__(self, message: str, operation: Optional[str] = None):
        details = {"operation": operation} if operation else {}
        super().__init__(
            message=f"Database error: {message}",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            details=details
        )


class ParseError(BetterManError):
    """Man page parsing error."""
    
    def __init__(self, message: str, command: Optional[str] = None):
        details = {"command": command} if command else {}
        super().__init__(
            message=f"Parse error: {message}",
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            details=details
        )


class SearchError(BetterManError):
    """Search operation error."""
    
    def __init__(self, message: str, query: Optional[str] = None):
        details = {"query": query} if query else {}
        super().__init__(
            message=f"Search error: {message}",
            status_code=status.HTTP_400_BAD_REQUEST,
            details=details
        )


class RateLimitError(BetterManError):
    """Rate limit exceeded error."""
    
    def __init__(self, limit: str, retry_after: Optional[int] = None):
        details = {"limit": limit}
        if retry_after:
            details["retry_after"] = retry_after
        super().__init__(
            message=f"Rate limit exceeded: {limit}",
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            details=details
        )
        self.retry_after = retry_after
        self.rate_limit = limit


class AuthenticationError(BetterManError):
    """Authentication error."""
    
    def __init__(self, message: str = "Authentication required"):
        super().__init__(
            message=message,
            status_code=status.HTTP_401_UNAUTHORIZED
        )


class AuthorizationError(BetterManError):
    """Authorization error."""
    
    def __init__(self, message: str = "Insufficient permissions"):
        super().__init__(
            message=message,
            status_code=status.HTTP_403_FORBIDDEN
        )


class CacheError(BetterManError):
    """Cache operation error."""
    
    def __init__(self, message: str, operation: Optional[str] = None):
        details = {"operation": operation} if operation else {}
        super().__init__(
            message=f"Cache error: {message}",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            details=details
        )


def create_error_response(
    status_code: int,
    message: str,
    details: Optional[Dict[str, Any]] = None,
    request_id: Optional[str] = None
) -> JSONResponse:
    """
    Create a standardized error response.
    
    Args:
        status_code: HTTP status code
        message: Error message
        details: Additional error details
        request_id: Request ID for tracking
        
    Returns:
        JSONResponse with error details
    """
    content = {
        "error": {
            "message": message,
            "status_code": status_code,
        }
    }
    
    if details:
        content["error"]["details"] = details
        
    if request_id:
        content["error"]["request_id"] = request_id
    
    return JSONResponse(
        status_code=status_code,
        content=content
    )


async def betterman_error_handler(request: Request, exc: BetterManError) -> JSONResponse:
    """Handle BetterMan custom errors."""
    request_id = getattr(request.state, "request_id", None)
    
    logger.error(
        f"BetterMan error: {exc.message}",
        extra={
            "request_id": request_id,
            "status_code": exc.status_code,
            "details": exc.details,
            "path": request.url.path,
            "method": request.method
        }
    )
    
    return create_error_response(
        status_code=exc.status_code,
        message=exc.message,
        details=exc.details,
        request_id=request_id
    )


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Handle request validation errors."""
    request_id = getattr(request.state, "request_id", None)
    
    # Extract validation errors
    errors = []
    for error in exc.errors():
        errors.append({
            "field": ".".join(str(loc) for loc in error["loc"]),
            "message": error["msg"],
            "type": error["type"]
        })
    
    logger.warning(
        "Validation error",
        extra={
            "request_id": request_id,
            "errors": errors,
            "path": request.url.path,
            "method": request.method
        }
    )
    
    return create_error_response(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        message="Validation error",
        details={"errors": errors},
        request_id=request_id
    )


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Handle HTTP exceptions."""
    request_id = getattr(request.state, "request_id", None)
    
    logger.warning(
        f"HTTP exception: {exc.detail}",
        extra={
            "request_id": request_id,
            "status_code": exc.status_code,
            "path": request.url.path,
            "method": request.method
        }
    )
    
    return create_error_response(
        status_code=exc.status_code,
        message=exc.detail,
        request_id=request_id
    )


async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle unexpected exceptions."""
    request_id = getattr(request.state, "request_id", None)
    
    # Log full traceback for debugging
    logger.error(
        f"Unexpected error: {str(exc)}",
        extra={
            "request_id": request_id,
            "path": request.url.path,
            "method": request.method,
            "traceback": traceback.format_exc()
        }
    )
    
    # Don't expose internal errors in production
    from .config import get_settings
    settings = get_settings()
    
    if settings.ENVIRONMENT == "development":
        details = {
            "type": type(exc).__name__,
            "traceback": traceback.format_exc().split("\n")
        }
    else:
        details = None
    
    return create_error_response(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        message="Internal server error",
        details=details,
        request_id=request_id
    )