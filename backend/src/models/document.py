"""Data models for BetterMan documents."""

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Index
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
