"""
ManPage model that maps to the existing man_pages table in PostgreSQL.
This model is used by the API to access man pages stored by the extractor.
"""

from sqlalchemy import (
    Column,
    String,
    Text,
    DateTime,
    Boolean,
    Integer,
    ARRAY,
    text,
    Index,
    CheckConstraint,
    UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID, JSONB, TSVECTOR
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
import uuid

Base = declarative_base()


class ManPage(Base):
    """SQLAlchemy model for man_pages table."""
    
    __tablename__ = "man_pages"
    
    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Core fields
    name = Column(String(255), nullable=False, index=True)
    section = Column(String(10), nullable=False, index=True)
    title = Column(Text)
    description = Column(Text)
    synopsis = Column(Text)
    
    # Content as JSONB
    content = Column(JSONB, nullable=False, default={})
    
    # Search and categorization
    search_vector = Column(TSVECTOR)
    category = Column(String(100), index=True)
    related_commands = Column(ARRAY(String), default=[])
    
    # Metadata
    meta_data = Column(JSONB, default={})
    
    # Performance and caching
    is_common = Column(Boolean, default=False, index=True)
    view_count = Column(Integer, default=0)
    last_accessed = Column(DateTime(timezone=True))
    cache_priority = Column(Integer, default=0)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Constraints
    __table_args__ = (
        UniqueConstraint('name', 'section', name='uq_man_page_name_section'),
        CheckConstraint('view_count >= 0', name='check_view_count_positive'),
        Index('idx_man_page_search_vector', 'search_vector', postgresql_using='gin'),
        Index('idx_man_page_category', 'category'),
        Index('idx_man_page_common', 'is_common'),
        Index('idx_man_page_name_section', 'name', 'section'),
        Index('idx_man_page_popularity', 'view_count', 'last_accessed'),
    )
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API responses."""
        return {
            "id": str(self.id),
            "name": self.name,
            "section": self.section,
            "title": self.title,
            "description": self.description,
            "synopsis": self.synopsis,
            "content": self.content,
            "category": self.category,
            "related_commands": self.related_commands,
            "meta_data": self.meta_data,
            "is_common": self.is_common,
            "view_count": self.view_count,
            "last_accessed": self.last_accessed.isoformat() if self.last_accessed else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }


# Pydantic models for API responses
class ManPageBase(BaseModel):
    """Base man page model for API responses."""
    id: str
    name: str
    section: str
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    
    class Config:
        orm_mode = True


class ManPageSummary(ManPageBase):
    """Summary view of a man page for lists."""
    is_common: bool = False
    view_count: int = 0


class ManPageDetail(ManPageBase):
    """Detailed view of a man page."""
    synopsis: Optional[str] = None
    content: Optional[Dict[str, Any]] = None
    related_commands: List[str] = []
    meta_data: Optional[Dict[str, Any]] = {}
    view_count: int = 0
    is_common: bool = False
    last_accessed: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class SearchResult(ManPageBase):
    """Search result with relevance score."""
    relevance: float = Field(0.0, description="Search relevance score")
    snippet: Optional[str] = Field(None, description="Text snippet with highlights")


class CategoryInfo(BaseModel):
    """Category information with statistics."""
    name: str
    slug: str
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    command_count: int = 0
    popular_commands: List[str] = []


class PopularCommand(ManPageSummary):
    """Popular command with ranking."""
    rank: int
    score: float
    trend: Optional[str] = None  # "rising", "falling", "stable"