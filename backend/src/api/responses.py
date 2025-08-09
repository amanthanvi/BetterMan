"""
Standardized API response formats for BetterMan.
"""

from typing import Optional, Any, Dict, List, Union, TypeVar, Generic
from pydantic import BaseModel, Field
from datetime import datetime
from fastapi import status
from fastapi.responses import JSONResponse
import json


T = TypeVar('T')


class BaseResponse(BaseModel):
    """Base response model for all API responses."""
    
    success: bool = Field(True, description="Whether the request was successful")
    message: Optional[str] = Field(None, description="Human-readable message")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Response timestamp")
    request_id: Optional[str] = Field(None, description="Request tracking ID")


class DataResponse(BaseResponse, Generic[T]):
    """Response model for data-returning endpoints."""
    
    data: T = Field(..., description="Response data")
    
    class Config:
        schema_extra = {
            "example": {
                "success": True,
                "data": {"example": "data"},
                "timestamp": "2023-12-01T10:00:00Z",
                "request_id": "req_123abc"
            }
        }


class PaginatedResponse(BaseResponse, Generic[T]):
    """Response model for paginated endpoints."""
    
    data: List[T] = Field(..., description="Page data")
    pagination: Dict[str, Any] = Field(..., description="Pagination metadata")
    
    class Config:
        schema_extra = {
            "example": {
                "success": True,
                "data": [{"id": 1, "name": "item1"}],
                "pagination": {
                    "page": 1,
                    "per_page": 10,
                    "total": 100,
                    "pages": 10,
                    "has_next": True,
                    "has_prev": False
                },
                "timestamp": "2023-12-01T10:00:00Z"
            }
        }


class ErrorResponse(BaseResponse):
    """Response model for error responses."""
    
    success: bool = Field(False, description="Always false for errors")
    error: Dict[str, Any] = Field(..., description="Error details")
    
    class Config:
        schema_extra = {
            "example": {
                "success": False,
                "message": "Resource not found",
                "error": {
                    "code": "NOT_FOUND",
                    "details": {"resource": "document", "id": "unknown"},
                    "field": None
                },
                "timestamp": "2023-12-01T10:00:00Z",
                "request_id": "req_123abc"
            }
        }


class SearchResponse(PaginatedResponse[Dict[str, Any]]):
    """Response model for search endpoints."""
    
    query: str = Field(..., description="Search query")
    filters: Optional[Dict[str, Any]] = Field(None, description="Applied filters")
    suggestions: Optional[List[str]] = Field(None, description="Query suggestions")
    facets: Optional[Dict[str, List[Dict[str, Any]]]] = Field(None, description="Search facets")
    
    class Config:
        schema_extra = {
            "example": {
                "success": True,
                "data": [
                    {
                        "id": "ls",
                        "title": "LS",
                        "section": 1,
                        "summary": "List directory contents",
                        "score": 0.95,
                        "highlights": ["List <mark>directory</mark> contents"]
                    }
                ],
                "query": "directory",
                "filters": {"section": 1},
                "pagination": {
                    "page": 1,
                    "per_page": 10,
                    "total": 25,
                    "pages": 3
                },
                "facets": {
                    "sections": [
                        {"value": 1, "count": 15},
                        {"value": 8, "count": 10}
                    ]
                }
            }
        }


class BatchResponse(BaseResponse):
    """Response model for batch operations."""
    
    results: List[Dict[str, Any]] = Field(..., description="Individual operation results")
    summary: Dict[str, int] = Field(..., description="Operation summary")
    
    class Config:
        schema_extra = {
            "example": {
                "success": True,
                "results": [
                    {"id": "ls", "success": True},
                    {"id": "grep", "success": True},
                    {"id": "unknown", "success": False, "error": "Not found"}
                ],
                "summary": {
                    "total": 3,
                    "succeeded": 2,
                    "failed": 1
                }
            }
        }


class HealthResponse(BaseResponse):
    """Response model for health check endpoint."""
    
    status: str = Field(..., description="Overall health status")
    version: str = Field(..., description="Application version")
    components: Dict[str, Dict[str, Any]] = Field(..., description="Component health details")
    
    class Config:
        schema_extra = {
            "example": {
                "success": True,
                "status": "healthy",
                "version": "1.0.0",
                "components": {
                    "database": {"status": "healthy", "latency_ms": 2},
                    "cache": {"status": "healthy", "latency_ms": 1},
                    "search": {"status": "healthy", "index_size": 1500}
                }
            }
        }


# Response helper functions
def create_success_response(
    data: Any = None,
    message: Optional[str] = None,
    status_code: int = status.HTTP_200_OK,
    request_id: Optional[str] = None,
    **kwargs
) -> JSONResponse:
    """
    Create a standardized success response.
    
    Args:
        data: Response data
        message: Optional message
        status_code: HTTP status code
        request_id: Request tracking ID
        **kwargs: Additional response fields
        
    Returns:
        JSONResponse with standardized format
    """
    response_data = {
        "success": True,
        "timestamp": datetime.utcnow().isoformat(),
    }
    
    if data is not None:
        response_data["data"] = data
    
    if message:
        response_data["message"] = message
    
    if request_id:
        response_data["request_id"] = request_id
    
    # Add any additional fields
    response_data.update(kwargs)
    
    return JSONResponse(
        content=response_data,
        status_code=status_code
    )


def create_error_response(
    message: str,
    status_code: int = status.HTTP_400_BAD_REQUEST,
    error_code: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    field: Optional[str] = None,
    request_id: Optional[str] = None
) -> JSONResponse:
    """
    Create a standardized error response.
    
    Args:
        message: Error message
        status_code: HTTP status code
        error_code: Machine-readable error code
        details: Additional error details
        field: Field that caused the error
        request_id: Request tracking ID
        
    Returns:
        JSONResponse with standardized error format
    """
    error_info = {
        "message": message,
        "code": error_code or _get_error_code(status_code),
    }
    
    if details:
        error_info["details"] = details
    
    if field:
        error_info["field"] = field
    
    response_data = {
        "success": False,
        "message": message,
        "error": error_info,
        "timestamp": datetime.utcnow().isoformat(),
    }
    
    if request_id:
        response_data["request_id"] = request_id
    
    return JSONResponse(
        content=response_data,
        status_code=status_code
    )


def create_paginated_response(
    data: List[Any],
    page: int,
    per_page: int,
    total: int,
    message: Optional[str] = None,
    request_id: Optional[str] = None,
    **kwargs
) -> JSONResponse:
    """
    Create a standardized paginated response.
    
    Args:
        data: Page data
        page: Current page number
        per_page: Items per page
        total: Total items
        message: Optional message
        request_id: Request tracking ID
        **kwargs: Additional response fields
        
    Returns:
        JSONResponse with pagination metadata
    """
    pages = (total + per_page - 1) // per_page
    
    pagination = {
        "page": page,
        "per_page": per_page,
        "total": total,
        "pages": pages,
        "has_next": page < pages,
        "has_prev": page > 1
    }
    
    response_data = {
        "success": True,
        "data": data,
        "pagination": pagination,
        "timestamp": datetime.utcnow().isoformat(),
    }
    
    if message:
        response_data["message"] = message
    
    if request_id:
        response_data["request_id"] = request_id
    
    # Add any additional fields
    response_data.update(kwargs)
    
    return JSONResponse(
        content=response_data,
        status_code=status.HTTP_200_OK
    )


def _get_error_code(status_code: int) -> str:
    """Get error code from HTTP status."""
    error_codes = {
        400: "BAD_REQUEST",
        401: "UNAUTHORIZED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        405: "METHOD_NOT_ALLOWED",
        409: "CONFLICT",
        422: "VALIDATION_ERROR",
        429: "TOO_MANY_REQUESTS",
        500: "INTERNAL_ERROR",
        502: "BAD_GATEWAY",
        503: "SERVICE_UNAVAILABLE",
    }
    return error_codes.get(status_code, "UNKNOWN_ERROR")


# Response models for OpenAPI documentation
class StandardResponses:
    """Standard response models for OpenAPI documentation."""
    
    NOT_FOUND = {
        404: {
            "description": "Resource not found",
            "model": ErrorResponse,
            "content": {
                "application/json": {
                    "example": {
                        "success": False,
                        "message": "Resource not found",
                        "error": {
                            "code": "NOT_FOUND",
                            "details": {"resource": "document", "id": "unknown"}
                        }
                    }
                }
            }
        }
    }
    
    VALIDATION_ERROR = {
        422: {
            "description": "Validation error",
            "model": ErrorResponse,
            "content": {
                "application/json": {
                    "example": {
                        "success": False,
                        "message": "Validation failed",
                        "error": {
                            "code": "VALIDATION_ERROR",
                            "field": "query",
                            "details": {"message": "Query too short"}
                        }
                    }
                }
            }
        }
    }
    
    UNAUTHORIZED = {
        401: {
            "description": "Unauthorized",
            "model": ErrorResponse
        }
    }
    
    SERVER_ERROR = {
        500: {
            "description": "Internal server error",
            "model": ErrorResponse
        }
    }