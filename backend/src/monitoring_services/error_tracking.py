"""
Enhanced error tracking and monitoring for BetterMan.
"""

import logging
import traceback
import json
from datetime import datetime
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, asdict
from sqlalchemy.orm import Session
from contextlib import contextmanager
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

from ..config import get_settings
from ..db.session import get_db

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass
class ErrorContext:
    """Context information for error tracking."""
    user_id: Optional[int] = None
    request_id: Optional[str] = None
    endpoint: Optional[str] = None
    method: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    query_params: Optional[Dict[str, Any]] = None
    body_params: Optional[Dict[str, Any]] = None
    headers: Optional[Dict[str, str]] = None
    session_id: Optional[str] = None
    

@dataclass
class ErrorReport:
    """Structured error report."""
    error_id: str
    timestamp: datetime
    error_type: str
    error_message: str
    stack_trace: str
    severity: str  # 'low', 'medium', 'high', 'critical'
    context: ErrorContext
    tags: Dict[str, str]
    extra: Dict[str, Any]


class ErrorTracker:
    """Enhanced error tracking with multiple backends."""
    
    def __init__(self):
        self.errors_buffer: List[ErrorReport] = []
        self.initialize_sentry()
    
    def initialize_sentry(self):
        """Initialize Sentry error tracking."""
        if settings.SENTRY_DSN:
            sentry_sdk.init(
                dsn=settings.SENTRY_DSN,
                environment=settings.ENVIRONMENT,
                integrations=[
                    FastApiIntegration(transaction_style="endpoint"),
                    SqlalchemyIntegration(),
                ],
                traces_sample_rate=0.1 if settings.ENVIRONMENT == "production" else 1.0,
                profiles_sample_rate=0.1 if settings.ENVIRONMENT == "production" else 1.0,
                attach_stacktrace=True,
                send_default_pii=False,  # Privacy protection
                before_send=self._before_send_sentry,
            )
            logger.info("Sentry error tracking initialized")
    
    def _before_send_sentry(self, event, hint):
        """Filter sensitive data before sending to Sentry."""
        # Remove sensitive headers
        if 'request' in event and 'headers' in event['request']:
            sensitive_headers = ['authorization', 'cookie', 'x-api-key']
            for header in sensitive_headers:
                if header in event['request']['headers']:
                    event['request']['headers'][header] = '[REDACTED]'
        
        # Remove sensitive query params
        if 'request' in event and 'query_string' in event['request']:
            # Parse and filter query string
            pass
        
        # Add custom tags
        if settings.ENVIRONMENT:
            event['tags']['environment'] = settings.ENVIRONMENT
        
        return event
    
    def track_error(
        self,
        error: Exception,
        context: Optional[ErrorContext] = None,
        severity: str = 'medium',
        tags: Optional[Dict[str, str]] = None,
        extra: Optional[Dict[str, Any]] = None
    ) -> str:
        """Track an error with context."""
        error_id = self._generate_error_id()
        
        # Create error report
        report = ErrorReport(
            error_id=error_id,
            timestamp=datetime.utcnow(),
            error_type=type(error).__name__,
            error_message=str(error),
            stack_trace=traceback.format_exc(),
            severity=severity,
            context=context or ErrorContext(),
            tags=tags or {},
            extra=extra or {}
        )
        
        # Log the error
        log_level = {
            'low': logging.WARNING,
            'medium': logging.ERROR,
            'high': logging.ERROR,
            'critical': logging.CRITICAL
        }.get(severity, logging.ERROR)
        
        logger.log(
            log_level,
            f"Error tracked: {report.error_type} - {report.error_message}",
            extra={
                'error_id': error_id,
                'error_type': report.error_type,
                'severity': severity,
                'context': asdict(report.context),
                'tags': report.tags,
            }
        )
        
        # Send to Sentry if configured
        if settings.SENTRY_DSN:
            with sentry_sdk.push_scope() as scope:
                # Add context
                if context:
                    scope.set_context("error_context", asdict(context))
                
                # Add tags
                for key, value in (tags or {}).items():
                    scope.set_tag(key, value)
                
                # Add extra data
                for key, value in (extra or {}).items():
                    scope.set_extra(key, value)
                
                # Set user context if available
                if context and context.user_id:
                    scope.set_user({"id": context.user_id})
                
                # Set severity
                scope.set_level(severity)
                
                # Capture the exception
                sentry_sdk.capture_exception(error)
        
        # Store in buffer for batch processing
        self.errors_buffer.append(report)
        
        # Persist to database if buffer is full
        if len(self.errors_buffer) >= 100:
            self.flush_errors()
        
        return error_id
    
    def track_message(
        self,
        message: str,
        level: str = 'info',
        context: Optional[ErrorContext] = None,
        tags: Optional[Dict[str, str]] = None,
        extra: Optional[Dict[str, Any]] = None
    ):
        """Track a message (non-exception event)."""
        if settings.SENTRY_DSN:
            with sentry_sdk.push_scope() as scope:
                if context:
                    scope.set_context("message_context", asdict(context))
                
                for key, value in (tags or {}).items():
                    scope.set_tag(key, value)
                
                for key, value in (extra or {}).items():
                    scope.set_extra(key, value)
                
                sentry_sdk.capture_message(message, level)
        
        # Also log locally
        log_level = getattr(logging, level.upper(), logging.INFO)
        logger.log(log_level, message, extra={'tags': tags, 'extra': extra})
    
    def flush_errors(self):
        """Persist buffered errors to database."""
        if not self.errors_buffer:
            return
        
        try:
            # In a real implementation, you would save to database
            # For now, just clear the buffer
            self.errors_buffer.clear()
        except Exception as e:
            logger.error(f"Failed to flush errors: {e}")
    
    def _generate_error_id(self) -> str:
        """Generate unique error ID."""
        import uuid
        return str(uuid.uuid4())
    
    @contextmanager
    def error_context(self, **kwargs):
        """Context manager for adding error context."""
        context = ErrorContext(**kwargs)
        try:
            yield context
        except Exception as e:
            self.track_error(e, context=context)
            raise


class PerformanceMonitor:
    """Monitor application performance metrics."""
    
    def __init__(self):
        self.metrics_buffer: List[Dict[str, Any]] = []
    
    def track_request(
        self,
        endpoint: str,
        method: str,
        duration_ms: float,
        status_code: int,
        request_size: int = 0,
        response_size: int = 0,
        tags: Optional[Dict[str, str]] = None
    ):
        """Track HTTP request performance."""
        metric = {
            'timestamp': datetime.utcnow().isoformat(),
            'type': 'http_request',
            'endpoint': endpoint,
            'method': method,
            'duration_ms': duration_ms,
            'status_code': status_code,
            'request_size': request_size,
            'response_size': response_size,
            'tags': tags or {}
        }
        
        self.metrics_buffer.append(metric)
        
        # Log slow requests
        if duration_ms > 1000:  # 1 second
            logger.warning(
                f"Slow request detected: {method} {endpoint} took {duration_ms}ms",
                extra=metric
            )
        
        # Send to monitoring service
        if settings.METRICS_ENABLED:
            self._send_metric(metric)
    
    def track_database_query(
        self,
        query: str,
        duration_ms: float,
        rows_affected: int = 0,
        tags: Optional[Dict[str, str]] = None
    ):
        """Track database query performance."""
        metric = {
            'timestamp': datetime.utcnow().isoformat(),
            'type': 'database_query',
            'query': self._sanitize_query(query),
            'duration_ms': duration_ms,
            'rows_affected': rows_affected,
            'tags': tags or {}
        }
        
        self.metrics_buffer.append(metric)
        
        # Log slow queries
        if duration_ms > 100:  # 100ms
            logger.warning(
                f"Slow query detected: {duration_ms}ms",
                extra=metric
            )
    
    def track_cache_operation(
        self,
        operation: str,  # 'get', 'set', 'delete'
        key: str,
        hit: bool,
        duration_ms: float,
        tags: Optional[Dict[str, str]] = None
    ):
        """Track cache operation performance."""
        metric = {
            'timestamp': datetime.utcnow().isoformat(),
            'type': 'cache_operation',
            'operation': operation,
            'key': self._sanitize_cache_key(key),
            'hit': hit,
            'duration_ms': duration_ms,
            'tags': tags or {}
        }
        
        self.metrics_buffer.append(metric)
    
    def get_metrics_summary(self) -> Dict[str, Any]:
        """Get summary of collected metrics."""
        if not self.metrics_buffer:
            return {}
        
        # Calculate summaries
        http_metrics = [m for m in self.metrics_buffer if m['type'] == 'http_request']
        db_metrics = [m for m in self.metrics_buffer if m['type'] == 'database_query']
        cache_metrics = [m for m in self.metrics_buffer if m['type'] == 'cache_operation']
        
        summary = {
            'http': {
                'total_requests': len(http_metrics),
                'avg_duration_ms': sum(m['duration_ms'] for m in http_metrics) / len(http_metrics) if http_metrics else 0,
                'error_rate': len([m for m in http_metrics if m['status_code'] >= 400]) / len(http_metrics) if http_metrics else 0,
            },
            'database': {
                'total_queries': len(db_metrics),
                'avg_duration_ms': sum(m['duration_ms'] for m in db_metrics) / len(db_metrics) if db_metrics else 0,
            },
            'cache': {
                'total_operations': len(cache_metrics),
                'hit_rate': len([m for m in cache_metrics if m.get('hit')]) / len(cache_metrics) if cache_metrics else 0,
            }
        }
        
        return summary
    
    def flush_metrics(self):
        """Send metrics to monitoring service."""
        if not self.metrics_buffer:
            return
        
        # In production, send to Prometheus, Datadog, etc.
        self.metrics_buffer.clear()
    
    def _sanitize_query(self, query: str) -> str:
        """Remove sensitive data from SQL queries."""
        # Simple sanitization - in production use proper SQL parser
        return query[:200] if len(query) > 200 else query
    
    def _sanitize_cache_key(self, key: str) -> str:
        """Sanitize cache keys for logging."""
        return key.split(':')[0] if ':' in key else key
    
    def _send_metric(self, metric: Dict[str, Any]):
        """Send metric to monitoring service."""
        # Implement actual metric sending (Prometheus, Datadog, etc.)
        pass


# Global instances
error_tracker = ErrorTracker()
performance_monitor = PerformanceMonitor()


# Convenience functions
def track_error(error: Exception, **kwargs) -> str:
    """Track an error with the global error tracker."""
    return error_tracker.track_error(error, **kwargs)


def track_message(message: str, **kwargs):
    """Track a message with the global error tracker."""
    error_tracker.track_message(message, **kwargs)


def track_request(**kwargs):
    """Track request performance with the global monitor."""
    performance_monitor.track_request(**kwargs)