"""
Error reporting and analytics API routes.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from pydantic import BaseModel, Field

from ..db.session import get_db
from ..auth.dependencies import get_current_user_optional
from ..models.user import User
from ..monitoring_services.error_tracking import error_tracker, ErrorContext
from ..analytics.models import ErrorReport, ErrorFeedback
from ..errors import ValidationError, AuthorizationError


router = APIRouter(prefix="/api/errors", tags=["errors"])


class ErrorReportRequest(BaseModel):
    """Frontend error report request."""
    error: Dict[str, Any] = Field(..., description="Error details")
    context: Optional[Dict[str, Any]] = Field(None, description="Error context")
    environment: Optional[Dict[str, Any]] = Field(None, description="Environment info")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    
    
class ErrorFeedbackRequest(BaseModel):
    """User feedback for an error."""
    error_id: str = Field(..., description="Error ID to provide feedback for")
    feedback: str = Field(..., min_length=1, max_length=1000)
    contact_allowed: bool = Field(False, description="User allows follow-up contact")
    

class ErrorSummary(BaseModel):
    """Error summary for analytics."""
    error_type: str
    count: int
    first_seen: datetime
    last_seen: datetime
    severity: str
    affected_users: int
    

class ErrorTrend(BaseModel):
    """Error trend data."""
    timestamp: datetime
    count: int
    error_rate: float


@router.post("/report", response_model=Dict[str, str])
async def report_error(
    request: ErrorReportRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Report an error from the frontend.
    
    This endpoint receives error reports from the frontend error boundary
    and tracking system. It logs the error, stores it for analytics,
    and returns an error ID for reference.
    """
    try:
        # Create error context
        context = ErrorContext(
            user_id=current_user.id if current_user else None,
            **request.context if request.context else {}
        )
        
        # Track the error
        error_id = error_tracker.track_error(
            Exception(request.error.get("message", "Unknown error")),
            context=context,
            severity="high" if request.error.get("name") == "Error" else "medium",
            tags={
                "source": "frontend",
                "error_type": request.error.get("name", "Unknown"),
            },
            extra={
                "error_details": request.error,
                "environment": request.environment,
            }
        )
        
        # Store in database for analytics
        error_report = ErrorReport(
            error_id=error_id,
            user_id=current_user.id if current_user else None,
            error_type=request.error.get("name", "Unknown"),
            error_message=request.error.get("message", ""),
            stack_trace=request.error.get("stack", ""),
            severity="high" if request.error.get("name") == "Error" else "medium",
            source="frontend",
            endpoint=request.context.get("endpoint") if request.context else None,
            user_agent=request.environment.get("userAgent") if request.environment else None,
            context_data=request.context,
            environment_data=request.environment,
            created_at=request.timestamp
        )
        
        db.add(error_report)
        db.commit()
        
        return {"error_id": error_id}
        
    except Exception as e:
        # Log the error but don't fail the request
        error_tracker.track_error(e, severity="critical")
        return {"error_id": "fallback-" + str(datetime.utcnow().timestamp())}


@router.post("/feedback")
async def submit_error_feedback(
    request: ErrorFeedbackRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Submit user feedback for an error.
    
    Allows users to provide additional context or feedback about an error
    they encountered, helping with debugging and improvement.
    """
    try:
        # Verify error exists
        error_report = db.query(ErrorReport).filter(
            ErrorReport.error_id == request.error_id
        ).first()
        
        if not error_report:
            raise ValidationError("Error ID not found", field="error_id")
        
        # Create feedback entry
        feedback = ErrorFeedback(
            error_id=request.error_id,
            user_id=current_user.id if current_user else None,
            feedback=request.feedback,
            contact_allowed=request.contact_allowed,
            created_at=datetime.utcnow()
        )
        
        db.add(feedback)
        db.commit()
        
        # Track feedback submission
        error_tracker.track_message(
            f"Error feedback received for {request.error_id}",
            level="info",
            tags={"error_id": request.error_id}
        )
        
        return {"status": "success", "message": "Thank you for your feedback"}
        
    except ValidationError:
        raise
    except Exception as e:
        error_tracker.track_error(e)
        raise HTTPException(
            status_code=500,
            detail="Failed to submit feedback"
        )


@router.get("/summary", response_model=List[ErrorSummary])
async def get_error_summary(
    days: int = Query(7, ge=1, le=90, description="Number of days to look back"),
    limit: int = Query(10, ge=1, le=100, description="Maximum number of error types"),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Get error summary for analytics dashboard.
    
    Returns aggregated error data for the specified time period,
    useful for monitoring application health and identifying issues.
    """
    # Only allow authenticated users or admins
    if not current_user or not current_user.is_admin:
        raise AuthorizationError("Admin access required")
    
    try:
        since = datetime.utcnow() - timedelta(days=days)
        
        # Query aggregated error data
        error_summary = db.query(
            ErrorReport.error_type,
            func.count(ErrorReport.id).label("count"),
            func.min(ErrorReport.created_at).label("first_seen"),
            func.max(ErrorReport.created_at).label("last_seen"),
            func.max(ErrorReport.severity).label("severity"),
            func.count(func.distinct(ErrorReport.user_id)).label("affected_users")
        ).filter(
            ErrorReport.created_at >= since
        ).group_by(
            ErrorReport.error_type
        ).order_by(
            desc("count")
        ).limit(limit).all()
        
        return [
            ErrorSummary(
                error_type=row.error_type,
                count=row.count,
                first_seen=row.first_seen,
                last_seen=row.last_seen,
                severity=row.severity,
                affected_users=row.affected_users
            )
            for row in error_summary
        ]
        
    except Exception as e:
        error_tracker.track_error(e)
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve error summary"
        )


@router.get("/trends", response_model=List[ErrorTrend])
async def get_error_trends(
    hours: int = Query(24, ge=1, le=168, description="Number of hours to look back"),
    interval: str = Query("hour", regex="^(hour|day)$", description="Aggregation interval"),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Get error trend data for visualization.
    
    Returns time-series data showing error counts and rates over time,
    useful for identifying patterns and spikes in errors.
    """
    if not current_user or not current_user.is_admin:
        raise AuthorizationError("Admin access required")
    
    try:
        since = datetime.utcnow() - timedelta(hours=hours)
        
        # Determine aggregation interval
        if interval == "hour":
            date_trunc = func.date_trunc('hour', ErrorReport.created_at)
        else:
            date_trunc = func.date_trunc('day', ErrorReport.created_at)
        
        # Query error trends
        trends = db.query(
            date_trunc.label("timestamp"),
            func.count(ErrorReport.id).label("count")
        ).filter(
            ErrorReport.created_at >= since
        ).group_by(
            "timestamp"
        ).order_by(
            "timestamp"
        ).all()
        
        # Calculate error rates (errors per hour)
        total_hours = hours
        results = []
        
        for row in trends:
            error_rate = row.count / (1 if interval == "hour" else 24)
            results.append(
                ErrorTrend(
                    timestamp=row.timestamp,
                    count=row.count,
                    error_rate=error_rate
                )
            )
        
        return results
        
    except Exception as e:
        error_tracker.track_error(e)
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve error trends"
        )


@router.get("/{error_id}")
async def get_error_details(
    error_id: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Get detailed information about a specific error.
    
    Returns full error details including stack trace, context,
    and any user feedback associated with the error.
    """
    if not current_user or not current_user.is_admin:
        raise AuthorizationError("Admin access required")
    
    try:
        # Get error report
        error_report = db.query(ErrorReport).filter(
            ErrorReport.error_id == error_id
        ).first()
        
        if not error_report:
            raise ValidationError("Error not found", field="error_id")
        
        # Get associated feedback
        feedback = db.query(ErrorFeedback).filter(
            ErrorFeedback.error_id == error_id
        ).all()
        
        return {
            "error": {
                "id": error_report.error_id,
                "type": error_report.error_type,
                "message": error_report.error_message,
                "stack_trace": error_report.stack_trace,
                "severity": error_report.severity,
                "source": error_report.source,
                "created_at": error_report.created_at,
                "user_id": error_report.user_id,
                "endpoint": error_report.endpoint,
                "user_agent": error_report.user_agent,
                "context": error_report.context_data,
                "environment": error_report.environment_data,
            },
            "feedback": [
                {
                    "user_id": f.user_id,
                    "feedback": f.feedback,
                    "contact_allowed": f.contact_allowed,
                    "created_at": f.created_at
                }
                for f in feedback
            ]
        }
        
    except ValidationError:
        raise
    except Exception as e:
        error_tracker.track_error(e)
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve error details"
        )