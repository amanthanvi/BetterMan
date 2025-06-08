"""Data models for BetterMan documents."""

from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    ForeignKey,
    Index,
    Boolean,
    JSON,
    Float,
)
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from datetime import datetime

Base = declarative_base()


# SQLAlchemy Models for database
class Document(Base):
    """SQLAlchemy model for a document."""

    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)  # Removed unique constraint for multi-section support
    title = Column(String, index=True)
    section = Column(String)  # Changed to String to support subsections like '3pm'
    summary = Column(String, nullable=True)
    content = Column(Text)  # Parsed content as JSON
    raw_content = Column(Text)
    category = Column(String, nullable=True, index=True)  # Document category
    tags = Column(String, nullable=True)  # Comma-separated tags
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Cache management fields
    is_common = Column(Boolean, default=False)  # Flag for pre-processed common commands
    last_accessed = Column(DateTime, default=datetime.utcnow)
    access_count = Column(Integer, default=0)  # Track popularity
    cache_status = Column(String, default="on_demand")  # Added cache status field
    cache_priority = Column(Integer, default=0)  # Added priority field for eviction
    view_count = Column(Integer, default=0)  # Track page views for analytics
    
    # Comprehensive loading fields
    meta_info = Column(JSON, nullable=True)  # Additional metadata (renamed from metadata)
    priority = Column(Integer, nullable=True)  # Loading priority (1-8)
    file_path = Column(String(500), nullable=True)  # Source file path
    file_size = Column(Integer, nullable=True)  # Original file size
    package_hint = Column(String(100), nullable=True)  # Package the command belongs to

    sections = relationship(
        "Section", back_populates="document", cascade="all, delete-orphan"
    )
    related_docs = relationship(
        "RelatedDocument", back_populates="document", cascade="all, delete-orphan"
    )


# Create unique constraint on name + section combination
Index('idx_document_name_section', Document.name, Document.section, unique=True)


class Section(Base):
    """SQLAlchemy model for a document section."""

    __tablename__ = "sections"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"))
    name = Column(String, index=True)
    content = Column(Text)
    order = Column(Integer)

    document = relationship("Document", back_populates="sections")
    subsections = relationship(
        "Subsection", back_populates="section", cascade="all, delete-orphan"
    )


class Subsection(Base):
    """SQLAlchemy model for a document subsection."""

    __tablename__ = "subsections"

    id = Column(Integer, primary_key=True, index=True)
    section_id = Column(Integer, ForeignKey("sections.id"))
    name = Column(String, index=True)
    content = Column(Text)
    order = Column(Integer)

    section = relationship("Section", back_populates="subsections")


class RelatedDocument(Base):
    """SQLAlchemy model for related documents."""

    __tablename__ = "related_documents"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"))
    related_name = Column(String, index=True)

    document = relationship("Document", back_populates="related_docs")


# Add indexes for efficient cache management
Index(
    "idx_document_access", Document.access_count.desc(), Document.last_accessed.desc()
)
Index("idx_document_common", Document.is_common)
Index("idx_document_cache_status", Document.cache_status)  # Added index
Index("idx_document_priority", Document.priority)
Index("idx_document_category", Document.category)


class LoadingSession(Base):
    """Track man page loading sessions."""
    
    __tablename__ = "loading_sessions"
    
    id = Column(Integer, primary_key=True)
    session_id = Column(String(100), unique=True, nullable=False)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=True)
    status = Column(String(50), nullable=False)  # initializing, discovering, processing, completed, failed, cancelled
    total_pages = Column(Integer, default=0)
    pages_processed = Column(Integer, default=0)
    pages_success = Column(Integer, default=0)
    pages_error = Column(Integer, default=0)
    pages_skipped = Column(Integer, default=0)
    current_section = Column(String(10), nullable=True)
    sections_completed = Column(JSON, nullable=True)  # List of completed sections
    error_log = Column(JSON, nullable=True)  # List of errors
    config = Column(JSON, nullable=True)  # Session configuration
    checkpoints = Column(JSON, nullable=True)  # Recovery checkpoints
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ManPageStats(Base):
    """Statistics for man pages."""
    
    __tablename__ = "man_page_stats"
    
    id = Column(Integer, primary_key=True)
    date = Column(DateTime, nullable=False)
    total_pages = Column(Integer, default=0)
    sections_count = Column(JSON, nullable=True)  # Count by section
    categories_count = Column(JSON, nullable=True)  # Count by category
    priorities_count = Column(JSON, nullable=True)  # Count by priority
    total_size_mb = Column(Float, nullable=True)
    average_size_kb = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


# Pydantic Models for API responses
class SubsectionResponse(BaseModel):
    """Pydantic model for subsection responses."""

    name: str
    content: str

    class Config:
        from_attributes = True


class SectionResponse(BaseModel):
    """Pydantic model for section responses."""

    name: str
    content: str
    subsections: Optional[List[SubsectionResponse]] = None

    class Config:
        from_attributes = True


class DocumentResponse(BaseModel):
    """Pydantic model for document responses."""

    id: int
    name: str
    title: str
    section: Optional[str] = None  # Changed to str to support subsections
    summary: Optional[str] = None
    content: Optional[str] = None  # Added content field
    raw_content: Optional[str] = None
    sections: Optional[List[SectionResponse]] = None
    related: Optional[List[str]] = None
    cache_status: Optional[str] = None  # Added to response model
    doc_set: Optional[str] = None  # For consistency with frontend
    
    @classmethod
    def from_orm(cls, obj):
        """Convert SQLAlchemy model to Pydantic model with sections."""
        import json
        
        data = {
            'id': obj.id,
            'name': obj.name,
            'title': obj.title,
            'section': str(obj.section) if obj.section else None,
            'summary': obj.summary,
            'content': obj.content,  # Add content field
            'raw_content': obj.raw_content,
            'cache_status': obj.cache_status,
            'doc_set': 'linux',  # Frontend expects lowercase
            'sections': [],
            'related': []
        }
        
        # Extract sections from JSON content
        if obj.content:
            try:
                content_data = json.loads(obj.content)
                if 'sections' in content_data and isinstance(content_data['sections'], list):
                    data['sections'] = [
                        {
                            'name': section.get('name', ''),
                            'content': section.get('content', ''),
                            'subsections': section.get('subsections', [])
                        }
                        for section in content_data['sections']
                    ]
            except (json.JSONDecodeError, KeyError) as e:
                # If parsing fails, fall back to using raw_content
                pass
        
        # Add sections from relationship if they exist (for backward compatibility)
        if not data['sections'] and hasattr(obj, 'sections') and obj.sections:
            data['sections'] = [
                {
                    'name': section.name,
                    'content': section.content,
                    'subsections': [
                        {
                            'name': subsection.name,
                            'content': subsection.content
                        }
                        for subsection in (section.subsections or [])
                    ]
                }
                for section in sorted(obj.sections, key=lambda s: s.order)
            ]
        
        # Add related documents
        if hasattr(obj, 'related_docs') and obj.related_docs:
            data['related'] = [rel.related_name for rel in obj.related_docs]
            
        return cls(**data)

    class Config:
        from_attributes = True


class SearchResult(BaseModel):
    """Pydantic model for search results."""

    id: str
    title: str
    summary: Optional[str] = None
    score: float = Field(..., description="Relevance score for the search result")

    class Config:
        from_attributes = True


class CacheStatistics(BaseModel):
    """Pydantic model for cache statistics."""

    total_documents: int
    common_documents: int
    cache_hit_rate: float
    most_popular: List[str]
    recently_accessed: List[str]
    cache_by_status: Optional[Dict[str, int]] = None  # Added statistics by cache status

    class Config:
        from_attributes = True
