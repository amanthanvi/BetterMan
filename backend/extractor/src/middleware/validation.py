"""
Comprehensive input validation middleware for BetterMan.
"""

from typing import Optional, Dict, Any, List, Union, Callable
from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel, Field, validator, ValidationError
import re
import logging
from datetime import datetime
import json

logger = logging.getLogger(__name__)


class ValidationRules:
    """Common validation rules and patterns."""
    
    # Patterns
    COMMAND_NAME = re.compile(r'^[a-zA-Z0-9\-_.+]{1,50}$')
    SECTION_NUMBER = re.compile(r'^[1-9]$')
    SAFE_STRING = re.compile(r'^[a-zA-Z0-9\s\-_.,!?]{0,1000}$')
    EMAIL = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
    
    # Limits
    MAX_QUERY_LENGTH = 200
    MAX_PAGE_SIZE = 100
    MAX_STRING_LENGTH = 1000
    MAX_ARRAY_LENGTH = 100
    
    # Forbidden patterns (potential injection)
    SQL_INJECTION_PATTERNS = [
        r"(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b)",
        r"(--|#|/\*|\*/)",
        r"(\bor\b\s*\d+\s*=\s*\d+)",
        r"(\band\b\s*\d+\s*=\s*\d+)",
    ]
    
    XSS_PATTERNS = [
        r"<script[^>]*>.*?</script>",
        r"javascript:",
        r"on\w+\s*=",
        r"<iframe",
        r"<object",
        r"<embed",
    ]


class InputValidator:
    """Input validation helper class."""
    
    @staticmethod
    def validate_command_name(value: str) -> str:
        """Validate command name format."""
        if not value:
            raise ValueError("Command name cannot be empty")
        
        if not ValidationRules.COMMAND_NAME.match(value):
            raise ValueError(
                "Invalid command name. Must be 1-50 characters, "
                "containing only letters, numbers, hyphens, underscores, dots, or plus signs"
            )
        
        return value
    
    @staticmethod
    def validate_section(value: Optional[Union[int, str]]) -> Optional[int]:
        """Validate section number."""
        if value is None:
            return None
        
        if isinstance(value, str):
            if not ValidationRules.SECTION_NUMBER.match(value):
                raise ValueError("Section must be a number between 1-9")
            value = int(value)
        
        if not 1 <= value <= 9:
            raise ValueError("Section must be between 1-9")
        
        return value
    
    @staticmethod
    def validate_search_query(value: str) -> str:
        """Validate search query."""
        if not value:
            raise ValueError("Search query cannot be empty")
        
        if len(value) > ValidationRules.MAX_QUERY_LENGTH:
            raise ValueError(f"Search query too long (max {ValidationRules.MAX_QUERY_LENGTH} characters)")
        
        # Check for potential injection patterns
        for pattern in ValidationRules.SQL_INJECTION_PATTERNS:
            if re.search(pattern, value, re.IGNORECASE):
                raise ValueError("Invalid characters in search query")
        
        return value.strip()
    
    @staticmethod
    def validate_pagination(page: int, per_page: int) -> tuple[int, int]:
        """Validate pagination parameters."""
        if page < 1:
            raise ValueError("Page number must be >= 1")
        
        if per_page < 1:
            raise ValueError("Items per page must be >= 1")
        
        if per_page > ValidationRules.MAX_PAGE_SIZE:
            raise ValueError(f"Items per page cannot exceed {ValidationRules.MAX_PAGE_SIZE}")
        
        return page, per_page
    
    @staticmethod
    def sanitize_string(value: str, max_length: int = None) -> str:
        """Sanitize string input."""
        if not value:
            return ""
        
        # Remove null bytes
        value = value.replace('\x00', '')
        
        # Limit length
        max_len = max_length or ValidationRules.MAX_STRING_LENGTH
        value = value[:max_len]
        
        # Check for XSS patterns
        for pattern in ValidationRules.XSS_PATTERNS:
            if re.search(pattern, value, re.IGNORECASE):
                raise ValueError("Invalid HTML/script content detected")
        
        return value
    
    @staticmethod
    def validate_email(value: str) -> str:
        """Validate email format."""
        if not value:
            raise ValueError("Email cannot be empty")
        
        if not ValidationRules.EMAIL.match(value):
            raise ValueError("Invalid email format")
        
        return value.lower()


# Pydantic models for request validation
class PaginationParams(BaseModel):
    """Base pagination parameters."""
    page: int = Field(1, ge=1, description="Page number")
    per_page: int = Field(10, ge=1, le=100, description="Items per page")


class SearchRequest(BaseModel):
    """Search request validation."""
    query: str = Field(..., min_length=1, max_length=200)
    section: Optional[int] = Field(None, ge=1, le=9)
    category: Optional[str] = Field(None, max_length=50)
    
    @validator('query')
    def validate_query(cls, v):
        return InputValidator.validate_search_query(v)
    
    @validator('category')
    def validate_category(cls, v):
        if v:
            return InputValidator.sanitize_string(v, 50)
        return v


class DocumentRequest(BaseModel):
    """Document request validation."""
    name: str = Field(..., min_length=1, max_length=50)
    force_refresh: bool = Field(False)
    
    @validator('name')
    def validate_name(cls, v):
        return InputValidator.validate_command_name(v)


class ValidationMiddleware(BaseHTTPMiddleware):
    """
    Middleware for comprehensive input validation.
    
    Features:
    - Request body validation
    - Query parameter validation
    - Header validation
    - Path parameter validation
    - Response validation
    """
    
    async def dispatch(self, request: Request, call_next: Callable) -> JSONResponse:
        # Start time for logging
        start_time = datetime.utcnow()
        
        try:
            # Validate request
            await self._validate_request(request)
            
            # Process request
            response = await call_next(request)
            
            # Log successful request
            duration = (datetime.utcnow() - start_time).total_seconds()
            self.logger.info(
                f"Request validated: {request.method} {request.url.path} "
                f"- {response.status_code} - {duration:.3f}s"
            )
            
            return response
            
        except ValidationException as e:
            # Log validation error
            logger.warning(
                f"Validation failed: {request.method} {request.url.path} - {e.message}"
            )
            
            return JSONResponse(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                content={
                    "error": {
                        "message": e.message,
                        "field": e.field,
                        "type": "validation_error"
                    }
                }
            )
        
        except Exception as e:
            # Log unexpected error
            logger.error(
                f"Unexpected error in validation: {request.method} {request.url.path} - {str(e)}"
            )
            
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content={
                    "error": {
                        "message": "Internal validation error",
                        "type": "internal_error"
                    }
                }
            )
    
    async def _validate_request(self, request: Request):
        """Validate incoming request."""
        # Validate headers
        self._validate_headers(request.headers)
        
        # Validate path parameters
        if request.path_params:
            self._validate_path_params(request.path_params, request.url.path)
        
        # Validate query parameters
        if request.query_params:
            self._validate_query_params(dict(request.query_params))
        
        # Validate body for POST/PUT/PATCH
        if request.method in ["POST", "PUT", "PATCH"]:
            await self._validate_body(request)
    
    def _validate_headers(self, headers: Dict[str, str]):
        """Validate request headers."""
        # Check content type for body requests
        content_type = headers.get("content-type", "")
        
        # Validate user agent
        user_agent = headers.get("user-agent", "")
        if len(user_agent) > 500:
            raise ValidationException("User-Agent header too long", "user-agent")
        
        # Check for suspicious headers
        suspicious_headers = ["x-forwarded-host", "x-original-url", "x-rewrite-url"]
        for header in suspicious_headers:
            if header in headers and not self._is_trusted_proxy(headers):
                logger.warning(f"Suspicious header detected: {header}")
    
    def _validate_path_params(self, params: Dict[str, Any], path: str):
        """Validate path parameters."""
        # Document name validation
        if "name" in params or "doc_id" in params:
            name = params.get("name") or params.get("doc_id")
            try:
                InputValidator.validate_command_name(str(name))
            except ValueError as e:
                raise ValidationException(str(e), "name")
        
        # Section validation
        if "section" in params:
            try:
                InputValidator.validate_section(params["section"])
            except ValueError as e:
                raise ValidationException(str(e), "section")
    
    def _validate_query_params(self, params: Dict[str, str]):
        """Validate query parameters."""
        # Search query
        if "q" in params or "query" in params:
            query = params.get("q") or params.get("query")
            try:
                InputValidator.validate_search_query(query)
            except ValueError as e:
                raise ValidationException(str(e), "query")
        
        # Pagination
        if "page" in params or "per_page" in params:
            try:
                page = int(params.get("page", 1))
                per_page = int(params.get("per_page", 10))
                InputValidator.validate_pagination(page, per_page)
            except ValueError as e:
                raise ValidationException(str(e), "pagination")
        
        # Section filter
        if "section" in params:
            try:
                InputValidator.validate_section(params["section"])
            except ValueError as e:
                raise ValidationException(str(e), "section")
    
    async def _validate_body(self, request: Request):
        """Validate request body."""
        try:
            # Get raw body
            body = await request.body()
            if not body:
                return
            
            # Parse JSON
            try:
                data = json.loads(body)
            except json.JSONDecodeError:
                raise ValidationException("Invalid JSON body", "body")
            
            # Check for deeply nested objects (potential DoS)
            if self._check_depth(data) > 10:
                raise ValidationException("Request body too deeply nested", "body")
            
            # Check total size
            if len(body) > 1024 * 1024:  # 1MB limit
                raise ValidationException("Request body too large", "body")
            
        except ValidationException:
            raise
        except Exception as e:
            logger.error(f"Body validation error: {e}")
            raise ValidationException("Invalid request body", "body")
    
    def _check_depth(self, obj: Any, current_depth: int = 0) -> int:
        """Check object nesting depth."""
        if current_depth > 20:  # Safety limit
            return current_depth
        
        if isinstance(obj, dict):
            if not obj:
                return current_depth
            return max(self._check_depth(v, current_depth + 1) for v in obj.values())
        elif isinstance(obj, list):
            if not obj:
                return current_depth
            return max(self._check_depth(item, current_depth + 1) for item in obj)
        else:
            return current_depth
    
    def _is_trusted_proxy(self, headers: Dict[str, str]) -> bool:
        """Check if request is from trusted proxy."""
        # In production, implement proper proxy trust validation
        return False


class ValidationException(Exception):
    """Custom validation exception."""
    
    def __init__(self, message: str, field: Optional[str] = None):
        self.message = message
        self.field = field
        super().__init__(message)


def create_validator(validation_func: Callable) -> Callable:
    """
    Decorator to create validated endpoints.
    
    Usage:
        @create_validator(DocumentRequest)
        async def get_document(request: DocumentRequest):
            ...
    """
    def decorator(func: Callable) -> Callable:
        async def wrapper(request: Request, *args, **kwargs):
            try:
                # Parse and validate request
                if validation_func:
                    body = await request.json() if request.method in ["POST", "PUT", "PATCH"] else {}
                    params = dict(request.query_params)
                    data = {**body, **params, **kwargs}
                    
                    validated = validation_func(**data)
                    kwargs['validated_data'] = validated
                
                return await func(request, *args, **kwargs)
                
            except ValidationError as e:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=e.errors()
                )
            except ValueError as e:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=str(e)
                )
        
        return wrapper
    return decorator