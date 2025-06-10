"""
Enhanced custom exception classes for BetterMan with detailed error tracking.
"""

from typing import Optional, Dict, Any, List
from enum import Enum
from dataclasses import dataclass, field
from datetime import datetime
import traceback


class ErrorSeverity(Enum):
    """Error severity levels."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ErrorCategory(Enum):
    """Error categories for better organization."""
    VALIDATION = "validation"
    AUTHENTICATION = "authentication"
    AUTHORIZATION = "authorization"
    DATABASE = "database"
    EXTERNAL_SERVICE = "external_service"
    PARSING = "parsing"
    CONFIGURATION = "configuration"
    RATE_LIMIT = "rate_limit"
    BUSINESS_LOGIC = "business_logic"
    SYSTEM = "system"


@dataclass
class ErrorContext:
    """Detailed context for error tracking."""
    request_id: Optional[str] = None
    user_id: Optional[int] = None
    endpoint: Optional[str] = None
    method: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    timestamp: datetime = field(default_factory=datetime.utcnow)
    additional_data: Dict[str, Any] = field(default_factory=dict)


@dataclass
class RecoverySuggestion:
    """Suggestion for recovering from an error."""
    action: str
    description: str
    automated: bool = False
    priority: int = 0


class EnhancedBetterManError(Exception):
    """Enhanced base exception with comprehensive error tracking."""
    
    def __init__(
        self,
        message: str,
        status_code: int = 500,
        error_code: Optional[str] = None,
        severity: ErrorSeverity = ErrorSeverity.MEDIUM,
        category: ErrorCategory = ErrorCategory.SYSTEM,
        details: Optional[Dict[str, Any]] = None,
        context: Optional[ErrorContext] = None,
        recovery_suggestions: Optional[List[RecoverySuggestion]] = None,
        user_message: Optional[str] = None,
        internal_only: bool = False
    ):
        self.message = message
        self.status_code = status_code
        self.error_code = error_code or self._generate_error_code()
        self.severity = severity
        self.category = category
        self.details = details or {}
        self.context = context or ErrorContext()
        self.recovery_suggestions = recovery_suggestions or []
        self.user_message = user_message or self._get_default_user_message()
        self.internal_only = internal_only
        self.stack_trace = traceback.format_exc()
        super().__init__(self.message)
    
    def _generate_error_code(self) -> str:
        """Generate a unique error code."""
        return f"{self.category.value.upper()}_{self.status_code}_{datetime.utcnow().timestamp()}"
    
    def _get_default_user_message(self) -> str:
        """Get a user-friendly error message."""
        return "An error occurred while processing your request."
    
    def to_dict(self, include_internal: bool = False) -> Dict[str, Any]:
        """Convert error to dictionary for API responses."""
        error_dict = {
            "error": {
                "code": self.error_code,
                "message": self.user_message if not include_internal else self.message,
                "status_code": self.status_code,
                "category": self.category.value,
                "severity": self.severity.value,
                "timestamp": self.context.timestamp.isoformat(),
            }
        }
        
        if self.recovery_suggestions:
            error_dict["error"]["recovery_suggestions"] = [
                {
                    "action": suggestion.action,
                    "description": suggestion.description,
                    "automated": suggestion.automated,
                    "priority": suggestion.priority,
                }
                for suggestion in self.recovery_suggestions
            ]
        
        if include_internal or not self.internal_only:
            error_dict["error"]["details"] = self.details
            
        if include_internal:
            error_dict["error"]["internal"] = {
                "message": self.message,
                "stack_trace": self.stack_trace,
                "context": {
                    "request_id": self.context.request_id,
                    "user_id": self.context.user_id,
                    "endpoint": self.context.endpoint,
                    "method": self.context.method,
                }
            }
        
        return error_dict


# Specific exception classes

class ValidationError(EnhancedBetterManError):
    """Enhanced validation error with field-specific details."""
    
    def __init__(
        self,
        message: str,
        field: Optional[str] = None,
        value: Any = None,
        constraints: Optional[Dict[str, Any]] = None,
        **kwargs
    ):
        details = {
            "field": field,
            "value": str(value) if value is not None else None,
            "constraints": constraints or {}
        }
        
        user_message = f"Invalid value for field '{field}'" if field else "Validation error"
        
        recovery_suggestions = [
            RecoverySuggestion(
                action="check_field_constraints",
                description=f"Ensure the value meets the required constraints: {constraints}",
                priority=1
            )
        ]
        
        super().__init__(
            message=message,
            status_code=400,
            severity=ErrorSeverity.LOW,
            category=ErrorCategory.VALIDATION,
            details=details,
            user_message=user_message,
            recovery_suggestions=recovery_suggestions,
            **kwargs
        )


class AuthenticationError(EnhancedBetterManError):
    """Enhanced authentication error."""
    
    def __init__(
        self,
        message: str = "Authentication required",
        auth_method: Optional[str] = None,
        **kwargs
    ):
        details = {
            "auth_method": auth_method,
            "required": True
        }
        
        recovery_suggestions = [
            RecoverySuggestion(
                action="authenticate",
                description="Please log in to access this resource",
                priority=1
            ),
            RecoverySuggestion(
                action="refresh_token",
                description="Try refreshing your authentication token",
                automated=True,
                priority=2
            )
        ]
        
        super().__init__(
            message=message,
            status_code=401,
            severity=ErrorSeverity.MEDIUM,
            category=ErrorCategory.AUTHENTICATION,
            details=details,
            recovery_suggestions=recovery_suggestions,
            **kwargs
        )


class AuthorizationError(EnhancedBetterManError):
    """Enhanced authorization error."""
    
    def __init__(
        self,
        message: str = "Insufficient permissions",
        required_permission: Optional[str] = None,
        user_permissions: Optional[List[str]] = None,
        **kwargs
    ):
        details = {
            "required_permission": required_permission,
            "user_permissions": user_permissions or []
        }
        
        recovery_suggestions = [
            RecoverySuggestion(
                action="request_permission",
                description="Contact an administrator to request the required permission",
                priority=1
            )
        ]
        
        super().__init__(
            message=message,
            status_code=403,
            severity=ErrorSeverity.MEDIUM,
            category=ErrorCategory.AUTHORIZATION,
            details=details,
            recovery_suggestions=recovery_suggestions,
            **kwargs
        )


class DatabaseError(EnhancedBetterManError):
    """Enhanced database error with connection recovery."""
    
    def __init__(
        self,
        message: str,
        operation: Optional[str] = None,
        table: Optional[str] = None,
        connection_error: bool = False,
        **kwargs
    ):
        details = {
            "operation": operation,
            "table": table,
            "connection_error": connection_error
        }
        
        recovery_suggestions = []
        
        if connection_error:
            recovery_suggestions.append(
                RecoverySuggestion(
                    action="retry_connection",
                    description="Automatically retry database connection",
                    automated=True,
                    priority=1
                )
            )
        
        recovery_suggestions.append(
            RecoverySuggestion(
                action="use_cache",
                description="Use cached data if available",
                automated=True,
                priority=2
            )
        )
        
        super().__init__(
            message=message,
            status_code=503,
            severity=ErrorSeverity.HIGH,
            category=ErrorCategory.DATABASE,
            details=details,
            recovery_suggestions=recovery_suggestions,
            user_message="Database temporarily unavailable",
            **kwargs
        )


class ExternalServiceError(EnhancedBetterManError):
    """Error when external service fails."""
    
    def __init__(
        self,
        message: str,
        service_name: str,
        endpoint: Optional[str] = None,
        timeout: bool = False,
        status_code: Optional[int] = None,
        **kwargs
    ):
        details = {
            "service_name": service_name,
            "endpoint": endpoint,
            "timeout": timeout,
            "service_status_code": status_code
        }
        
        recovery_suggestions = [
            RecoverySuggestion(
                action="use_fallback",
                description=f"Use fallback service for {service_name}",
                automated=True,
                priority=1
            ),
            RecoverySuggestion(
                action="retry_with_backoff",
                description="Retry with exponential backoff",
                automated=True,
                priority=2
            )
        ]
        
        if timeout:
            recovery_suggestions.append(
                RecoverySuggestion(
                    action="increase_timeout",
                    description="Temporarily increase timeout for slow services",
                    automated=True,
                    priority=3
                )
            )
        
        super().__init__(
            message=message,
            status_code=502,
            severity=ErrorSeverity.MEDIUM,
            category=ErrorCategory.EXTERNAL_SERVICE,
            details=details,
            recovery_suggestions=recovery_suggestions,
            user_message=f"External service temporarily unavailable",
            **kwargs
        )


class RateLimitError(EnhancedBetterManError):
    """Enhanced rate limit error with retry information."""
    
    def __init__(
        self,
        message: str,
        limit_type: str,
        limit: int,
        window: int,
        retry_after: Optional[int] = None,
        current_usage: Optional[int] = None,
        **kwargs
    ):
        details = {
            "limit_type": limit_type,
            "limit": limit,
            "window": window,
            "retry_after": retry_after,
            "current_usage": current_usage
        }
        
        recovery_suggestions = [
            RecoverySuggestion(
                action="wait_and_retry",
                description=f"Wait {retry_after} seconds before retrying",
                automated=True,
                priority=1
            ),
            RecoverySuggestion(
                action="upgrade_plan",
                description="Upgrade your plan for higher rate limits",
                priority=2
            )
        ]
        
        super().__init__(
            message=message,
            status_code=429,
            severity=ErrorSeverity.LOW,
            category=ErrorCategory.RATE_LIMIT,
            details=details,
            recovery_suggestions=recovery_suggestions,
            user_message=f"Rate limit exceeded. Please try again in {retry_after} seconds.",
            **kwargs
        )
        
        self.retry_after = retry_after


class ParseError(EnhancedBetterManError):
    """Enhanced parsing error with detailed context."""
    
    def __init__(
        self,
        message: str,
        command: Optional[str] = None,
        line_number: Optional[int] = None,
        column: Optional[int] = None,
        snippet: Optional[str] = None,
        **kwargs
    ):
        details = {
            "command": command,
            "line_number": line_number,
            "column": column,
            "snippet": snippet
        }
        
        recovery_suggestions = [
            RecoverySuggestion(
                action="use_alternative_parser",
                description="Try alternative parsing method",
                automated=True,
                priority=1
            ),
            RecoverySuggestion(
                action="report_issue",
                description="Report this parsing issue for investigation",
                priority=2
            )
        ]
        
        super().__init__(
            message=message,
            status_code=422,
            severity=ErrorSeverity.MEDIUM,
            category=ErrorCategory.PARSING,
            details=details,
            recovery_suggestions=recovery_suggestions,
            user_message="Unable to parse the requested content",
            **kwargs
        )


class BusinessLogicError(EnhancedBetterManError):
    """Error for business rule violations."""
    
    def __init__(
        self,
        message: str,
        rule: str,
        **kwargs
    ):
        details = {
            "violated_rule": rule
        }
        
        super().__init__(
            message=message,
            status_code=409,
            severity=ErrorSeverity.MEDIUM,
            category=ErrorCategory.BUSINESS_LOGIC,
            details=details,
            **kwargs
        )


class ConfigurationError(EnhancedBetterManError):
    """Error for configuration issues."""
    
    def __init__(
        self,
        message: str,
        config_key: Optional[str] = None,
        expected_type: Optional[str] = None,
        **kwargs
    ):
        details = {
            "config_key": config_key,
            "expected_type": expected_type
        }
        
        recovery_suggestions = [
            RecoverySuggestion(
                action="use_default",
                description="Use default configuration value",
                automated=True,
                priority=1
            )
        ]
        
        super().__init__(
            message=message,
            status_code=500,
            severity=ErrorSeverity.HIGH,
            category=ErrorCategory.CONFIGURATION,
            details=details,
            recovery_suggestions=recovery_suggestions,
            internal_only=True,
            **kwargs
        )


# Error factory for creating errors with consistent context
class ErrorFactory:
    """Factory for creating errors with consistent context."""
    
    def __init__(self, default_context: Optional[ErrorContext] = None):
        self.default_context = default_context or ErrorContext()
    
    def validation_error(self, message: str, **kwargs) -> ValidationError:
        """Create a validation error."""
        kwargs.setdefault('context', self.default_context)
        return ValidationError(message, **kwargs)
    
    def database_error(self, message: str, **kwargs) -> DatabaseError:
        """Create a database error."""
        kwargs.setdefault('context', self.default_context)
        return DatabaseError(message, **kwargs)
    
    def not_found(self, resource: str, identifier: Any) -> EnhancedBetterManError:
        """Create a not found error."""
        return EnhancedBetterManError(
            message=f"{resource} not found: {identifier}",
            status_code=404,
            severity=ErrorSeverity.LOW,
            category=ErrorCategory.BUSINESS_LOGIC,
            context=self.default_context,
            user_message=f"The requested {resource} was not found"
        )