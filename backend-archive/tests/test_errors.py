"""
Tests for error handling.
"""

import pytest
from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from unittest.mock import Mock, patch

from src.errors import (
    BetterManError,
    NotFoundError,
    ValidationError,
    DatabaseError,
    ParseError,
    SearchError,
    RateLimitError,
    create_error_response,
    betterman_error_handler,
    validation_error_handler,
    http_exception_handler,
    generic_exception_handler
)


class TestCustomExceptions:
    """Test custom exception classes."""
    
    def test_betterman_error(self):
        """Test base BetterMan error."""
        error = BetterManError("Test error", status_code=400, details={"key": "value"})
        assert str(error) == "Test error"
        assert error.status_code == 400
        assert error.details == {"key": "value"}
    
    def test_not_found_error(self):
        """Test not found error."""
        error = NotFoundError("Document", "test-doc")
        assert error.status_code == status.HTTP_404_NOT_FOUND
        assert "Document not found: test-doc" in str(error)
        assert error.details["resource"] == "Document"
        assert error.details["identifier"] == "test-doc"
    
    def test_validation_error(self):
        """Test validation error."""
        error = ValidationError("Invalid input", field="username")
        assert error.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        assert str(error) == "Invalid input"
        assert error.details["field"] == "username"
    
    def test_database_error(self):
        """Test database error."""
        error = DatabaseError("Connection failed", operation="insert")
        assert error.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert "Database error: Connection failed" in str(error)
        assert error.details["operation"] == "insert"
    
    def test_parse_error(self):
        """Test parse error."""
        error = ParseError("Invalid format", command="test")
        assert error.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        assert "Parse error: Invalid format" in str(error)
        assert error.details["command"] == "test"
    
    def test_search_error(self):
        """Test search error."""
        error = SearchError("Invalid query", query="test*")
        assert error.status_code == status.HTTP_400_BAD_REQUEST
        assert "Search error: Invalid query" in str(error)
        assert error.details["query"] == "test*"
    
    def test_rate_limit_error(self):
        """Test rate limit error."""
        error = RateLimitError("100/hour", retry_after=3600)
        assert error.status_code == status.HTTP_429_TOO_MANY_REQUESTS
        assert "Rate limit exceeded: 100/hour" in str(error)
        assert error.details["limit"] == "100/hour"
        assert error.details["retry_after"] == 3600


class TestErrorResponse:
    """Test error response creation."""
    
    def test_create_error_response_basic(self):
        """Test basic error response."""
        response = create_error_response(
            status_code=400,
            message="Bad request"
        )
        assert isinstance(response, JSONResponse)
        assert response.status_code == 400
        assert response.body == b'{"error":{"message":"Bad request","status_code":400}}'
    
    def test_create_error_response_with_details(self):
        """Test error response with details."""
        response = create_error_response(
            status_code=404,
            message="Not found",
            details={"resource": "document", "id": "123"}
        )
        content = response.body.decode('utf-8')
        assert '"details":{"resource":"document","id":"123"}' in content
    
    def test_create_error_response_with_request_id(self):
        """Test error response with request ID."""
        response = create_error_response(
            status_code=500,
            message="Server error",
            request_id="abc-123"
        )
        content = response.body.decode('utf-8')
        assert '"request_id":"abc-123"' in content


class TestErrorHandlers:
    """Test error handler functions."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.request = Mock(spec=Request)
        self.request.url.path = "/api/test"
        self.request.method = "GET"
        self.request.state = Mock()
        self.request.state.request_id = "test-123"
    
    @pytest.mark.asyncio
    async def test_betterman_error_handler(self):
        """Test BetterMan error handler."""
        error = NotFoundError("Document", "test")
        response = await betterman_error_handler(self.request, error)
        
        assert response.status_code == 404
        content = response.body.decode('utf-8')
        assert "Document not found: test" in content
        assert "test-123" in content  # Request ID
    
    @pytest.mark.asyncio
    async def test_validation_error_handler(self):
        """Test validation error handler."""
        # Create mock validation error
        mock_error = Mock(spec=RequestValidationError)
        mock_error.errors.return_value = [
            {
                "loc": ["body", "username"],
                "msg": "field required",
                "type": "value_error.missing"
            }
        ]
        
        response = await validation_error_handler(self.request, mock_error)
        
        assert response.status_code == 422
        content = response.body.decode('utf-8')
        assert "Validation error" in content
        assert "body.username" in content
        assert "field required" in content
    
    @pytest.mark.asyncio
    async def test_http_exception_handler(self):
        """Test HTTP exception handler."""
        error = StarletteHTTPException(status_code=403, detail="Forbidden")
        response = await http_exception_handler(self.request, error)
        
        assert response.status_code == 403
        content = response.body.decode('utf-8')
        assert "Forbidden" in content
    
    @pytest.mark.asyncio
    async def test_generic_exception_handler_development(self):
        """Test generic exception handler in development mode."""
        with patch('src.errors.get_settings') as mock_settings:
            mock_settings.return_value.ENVIRONMENT = "development"
            
            error = ValueError("Test error")
            response = await generic_exception_handler(self.request, error)
            
            assert response.status_code == 500
            content = response.body.decode('utf-8')
            assert "Internal server error" in content
            assert "ValueError" in content  # Type exposed in dev
            assert "traceback" in content  # Traceback exposed in dev
    
    @pytest.mark.asyncio
    async def test_generic_exception_handler_production(self):
        """Test generic exception handler in production mode."""
        with patch('src.errors.get_settings') as mock_settings:
            mock_settings.return_value.ENVIRONMENT = "production"
            
            error = ValueError("Test error")
            response = await generic_exception_handler(self.request, error)
            
            assert response.status_code == 500
            content = response.body.decode('utf-8')
            assert "Internal server error" in content
            assert "ValueError" not in content  # Type hidden in prod
            assert "traceback" not in content  # Traceback hidden in prod