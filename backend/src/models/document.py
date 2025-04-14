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
    name = Column(String, unique=True, index=True)
    title = Column(String, index=True)
    section = Column(Integer)
    summary = Column(String, nullable=True)
    raw_content = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Cache management fields
    is_common = Column(Boolean, default=False)  # Flag for pre-processed common commands
    last_accessed = Column(DateTime, default=datetime.utcnow)
    access_count = Column(Integer, default=0)  # Track popularity
    cache_status = Column(String, default="on_demand")  # Added cache status field
    cache_priority = Column(Integer, default=0)  # Added priority field for eviction

    sections = relationship(
        "Section", back_populates="document", cascade="all, delete-orphan"
    )
    related_docs = relationship(
        "RelatedDocument", back_populates="document", cascade="all, delete-orphan"
    )


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
    section: Optional[int] = None
    summary: Optional[str] = None
    sections: Optional[List[SectionResponse]] = None
    related: Optional[List[str]] = None
    cache_status: Optional[str] = None  # Added to response model

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
