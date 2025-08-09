"""Recovery middleware for automatic error recovery and circuit breaking."""

import asyncio
import time
import logging
from typing import Dict, Optional, Callable
from datetime import datetime, timedelta
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
import redis
from contextlib import asynccontextmanager

logger = logging.getLogger(__name__)


class CircuitState:
    """Circuit breaker states."""
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreaker:
    """Circuit breaker implementation for fault tolerance."""
    
    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout: int = 60,
        expected_exception: type = Exception
    ):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.expected_exception = expected_exception
        self.failure_count = 0
        self.last_failure_time: Optional[datetime] = None
        self.state = CircuitState.CLOSED
        
    def call_succeeded(self):
        """Reset the circuit breaker on successful call."""
        self.failure_count = 0
        self.last_failure_time = None
        if self.state == CircuitState.HALF_OPEN:
            self.state = CircuitState.CLOSED
            logger.info("Circuit breaker closed after successful call")
            
    def call_failed(self):
        """Record a failed call."""
        self.failure_count += 1
        self.last_failure_time = datetime.utcnow()
        
        if self.failure_count >= self.failure_threshold:
            self.state = CircuitState.OPEN
            logger.warning(f"Circuit breaker opened after {self.failure_count} failures")
            
    def can_execute(self) -> bool:
        """Check if we can execute the call."""
        if self.state == CircuitState.CLOSED:
            return True
            
        if self.state == CircuitState.OPEN:
            if self.last_failure_time and \
               datetime.utcnow() - self.last_failure_time > timedelta(seconds=self.recovery_timeout):
                self.state = CircuitState.HALF_OPEN
                logger.info("Circuit breaker entering half-open state")
                return True
            return False
            
        # HALF_OPEN state
        return True
        
    async def execute(self, func: Callable, *args, **kwargs):
        """Execute function with circuit breaker protection."""
        if not self.can_execute():
            raise Exception("Circuit breaker is open")
            
        try:
            result = await func(*args, **kwargs)
            self.call_succeeded()
            return result
        except self.expected_exception as e:
            self.call_failed()
            raise


class RecoveryMiddleware(BaseHTTPMiddleware):
    """Middleware for automatic recovery and resilience patterns."""
    
    def __init__(
        self,
        app,
        enable_circuit_breaker: bool = True,
        enable_retry: bool = True,
        enable_timeout: bool = True,
        enable_bulkhead: bool = True,
        max_retries: int = 3,
        retry_delay: float = 1.0,
        request_timeout: float = 30.0,
        max_concurrent_requests: int = 100,
        redis_client: Optional[redis.Redis] = None
    ):
        super().__init__(app)
        self.enable_circuit_breaker = enable_circuit_breaker
        self.enable_retry = enable_retry
        self.enable_timeout = enable_timeout
        self.enable_bulkhead = enable_bulkhead
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.request_timeout = request_timeout
        self.max_concurrent_requests = max_concurrent_requests
        self.redis_client = redis_client
        
        # Circuit breakers for different services
        self.circuit_breakers: Dict[str, CircuitBreaker] = {
            "database": CircuitBreaker(failure_threshold=10, recovery_timeout=30),
            "cache": CircuitBreaker(failure_threshold=5, recovery_timeout=20),
            "search": CircuitBreaker(failure_threshold=5, recovery_timeout=30),
            "external": CircuitBreaker(failure_threshold=3, recovery_timeout=60),
        }
        
        # Bulkhead pattern - limit concurrent requests
        self.semaphore = asyncio.Semaphore(max_concurrent_requests)
        self.current_requests = 0
        
    def get_service_from_path(self, path: str) -> str:
        """Determine which service a path belongs to."""
        if "/api/search" in path:
            return "search"
        elif "/api/cache" in path:
            return "cache"
        elif "/api/external" in path:
            return "external"
        else:
            return "database"
            
    async def dispatch(self, request: Request, call_next):
        """Handle request with recovery patterns."""
        start_time = time.time()
        service = self.get_service_from_path(request.url.path)
        
        # Skip recovery for health checks
        if request.url.path in ["/health", "/metrics"]:
            return await call_next(request)
            
        try:
            # Bulkhead pattern - limit concurrent requests
            if self.enable_bulkhead:
                if self.current_requests >= self.max_concurrent_requests:
                    return JSONResponse(
                        status_code=503,
                        content={
                            "error": {
                                "code": "SERVICE_OVERLOADED",
                                "message": "Too many concurrent requests",
                                "retry_after": 5
                            }
                        },
                        headers={"Retry-After": "5"}
                    )
                    
            async with self.semaphore:
                self.current_requests += 1
                try:
                    # Circuit breaker check
                    if self.enable_circuit_breaker:
                        breaker = self.circuit_breakers.get(service)
                        if breaker and not breaker.can_execute():
                            return JSONResponse(
                                status_code=503,
                                content={
                                    "error": {
                                        "code": "CIRCUIT_BREAKER_OPEN",
                                        "message": f"Service {service} is temporarily unavailable",
                                        "retry_after": breaker.recovery_timeout
                                    }
                                },
                                headers={"Retry-After": str(breaker.recovery_timeout)}
                            )
                            
                    # Execute with timeout
                    if self.enable_timeout:
                        response = await asyncio.wait_for(
                            self._execute_with_retry(request, call_next, service),
                            timeout=self.request_timeout
                        )
                    else:
                        response = await self._execute_with_retry(request, call_next, service)
                        
                    # Record success
                    if self.enable_circuit_breaker and service in self.circuit_breakers:
                        self.circuit_breakers[service].call_succeeded()
                        
                    # Add recovery headers
                    response.headers["X-Recovery-Service"] = service
                    response.headers["X-Recovery-Time"] = f"{time.time() - start_time:.3f}"
                    
                    return response
                    
                finally:
                    self.current_requests -= 1
                    
        except asyncio.TimeoutError:
            logger.error(f"Request timeout for {request.url.path}")
            return JSONResponse(
                status_code=504,
                content={
                    "error": {
                        "code": "REQUEST_TIMEOUT",
                        "message": "Request processing timed out",
                        "timeout": self.request_timeout
                    }
                }
            )
            
        except Exception as e:
            # Record failure in circuit breaker
            if self.enable_circuit_breaker and service in self.circuit_breakers:
                self.circuit_breakers[service].call_failed()
                
            logger.error(f"Unhandled error in recovery middleware: {str(e)}")
            return JSONResponse(
                status_code=500,
                content={
                    "error": {
                        "code": "INTERNAL_ERROR",
                        "message": "An unexpected error occurred"
                    }
                }
            )
            
    async def _execute_with_retry(self, request: Request, call_next, service: str):
        """Execute request with retry logic."""
        if not self.enable_retry:
            return await call_next(request)
            
        last_exception = None
        
        for attempt in range(self.max_retries):
            try:
                return await call_next(request)
                
            except Exception as e:
                last_exception = e
                
                # Don't retry client errors
                if hasattr(e, 'status_code') and 400 <= e.status_code < 500:
                    raise
                    
                # Check if we should retry
                if attempt < self.max_retries - 1:
                    retry_delay = self.retry_delay * (2 ** attempt)  # Exponential backoff
                    logger.warning(
                        f"Request failed (attempt {attempt + 1}/{self.max_retries}), "
                        f"retrying in {retry_delay}s: {str(e)}"
                    )
                    await asyncio.sleep(retry_delay)
                else:
                    logger.error(f"All retry attempts failed for {request.url.path}")
                    
        raise last_exception


class HealthCheckMiddleware(BaseHTTPMiddleware):
    """Middleware for automatic health checking and failover."""
    
    def __init__(
        self,
        app,
        health_check_interval: int = 30,
        unhealthy_threshold: int = 3,
        healthy_threshold: int = 2
    ):
        super().__init__(app)
        self.health_check_interval = health_check_interval
        self.unhealthy_threshold = unhealthy_threshold
        self.healthy_threshold = healthy_threshold
        self.service_health: Dict[str, Dict] = {}
        self._health_check_task = None
        
    async def startup(self):
        """Start health check background task."""
        self._health_check_task = asyncio.create_task(self._health_check_loop())
        
    async def shutdown(self):
        """Stop health check background task."""
        if self._health_check_task:
            self._health_check_task.cancel()
            
    async def _health_check_loop(self):
        """Background task to check service health."""
        while True:
            try:
                await self._check_services()
                await asyncio.sleep(self.health_check_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in health check loop: {e}")
                
    async def _check_services(self):
        """Check health of all services."""
        # This would check various services and update self.service_health
        pass
        
    async def dispatch(self, request: Request, call_next):
        """Route requests based on service health."""
        return await call_next(request)