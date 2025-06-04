"""Analytics data models."""

from sqlalchemy import (
    Column, Integer, String, Text, DateTime, 
    ForeignKey, Float, Boolean, JSON
)
from sqlalchemy.orm import relationship
from datetime import datetime
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

from ..models.document import Base


class PageView(Base):
    """Track document page views."""
    __tablename__ = "page_views"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=True)  # TODO: Add ForeignKey when User model is ready
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    session_id = Column(String(128), index=True)
    ip_hash = Column(String(64))
    user_agent = Column(Text)
    referrer = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    # Relationships
    # user = relationship("User", backref="page_views")  # TODO: Enable when User model is implemented
    document = relationship("Document", backref="page_views")


class SearchAnalytics(Base):
    """Track search queries and results."""
    __tablename__ = "search_analytics"
    
    id = Column(Integer, primary_key=True, index=True)
    query = Column(String(500), nullable=False, index=True)
    results_count = Column(Integer, nullable=False)
    user_id = Column(Integer, nullable=True)  # TODO: Add ForeignKey when User model is ready
    session_id = Column(String(128))
    search_duration_ms = Column(Integer)
    clicked_result_id = Column(Integer, ForeignKey("documents.id", ondelete="SET NULL"))
    clicked_position = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    # Relationships
    # user = relationship("User", backref="search_analytics")  # TODO: Enable when User model is implemented
    clicked_result = relationship("Document", backref="search_clicks")


class FeatureUsage(Base):
    """Track feature usage."""
    __tablename__ = "feature_usage"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=True)  # TODO: Add ForeignKey when User model is ready
    feature_name = Column(String(100), nullable=False, index=True)
    action = Column(String(100), nullable=False)
    feature_metadata = Column(Text)  # JSON string
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    # Relationships
    # user = relationship("User", backref="feature_usage")  # TODO: Enable when User model is implemented


class UserNote(Base):
    """User-created notes on documents."""
    __tablename__ = "user_notes"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=True)  # TODO: Add ForeignKey when User model is ready
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    # user = relationship("User", backref="notes")  # TODO: Enable when User model is implemented
    document = relationship("Document", backref="user_notes")


class CacheMetadata(Base):
    """Track cache performance."""
    __tablename__ = "cache_metadata"
    
    id = Column(Integer, primary_key=True, index=True)
    cache_key = Column(String(255), nullable=False, unique=True, index=True)
    hit_count = Column(Integer, default=0)
    miss_count = Column(Integer, default=0)
    last_accessed = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)


# Pydantic models for API responses
class PopularCommand(BaseModel):
    """Popular command response model."""
    id: str
    name: str
    title: str
    summary: Optional[str] = None
    section: int
    view_count: int
    unique_users: int
    trend: str = Field(description="up, down, or stable")
    
    class Config:
        from_attributes = True


class AnalyticsOverview(BaseModel):
    """Analytics overview response."""
    total_searches: int
    total_page_views: int
    active_users: int
    popular_commands: List[PopularCommand]
    search_trends: List[Dict[str, Any]]
    
    class Config:
        from_attributes = True


class UserAnalytics(BaseModel):
    """User-specific analytics."""
    total_searches: int
    total_views: int
    favorite_commands: List[str]
    recent_activity: List[Dict[str, Any]]
    
    class Config:
        from_attributes = True