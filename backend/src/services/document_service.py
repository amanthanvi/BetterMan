"""
Document service for managing man page documents.
"""

from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
import logging

from .base import BaseService
from ..models.document import Document, Section
from ..errors import NotFoundError, ValidationError
from ..cache.cache_manager import CacheManager


class DocumentService(BaseService[Document]):
    """Service for managing document operations."""
    
    def __init__(self, db: Session, cache_manager: Optional[CacheManager] = None):
        """
        Initialize document service.
        
        Args:
            db: Database session
            cache_manager: Optional cache manager instance
        """
        super().__init__(db)
        self.cache = cache_manager
        self.logger = logging.getLogger(__name__)
    
    def get_by_name(self, name: str) -> Document:
        """
        Get document by name.
        
        Args:
            name: Document name
            
        Returns:
            Document instance
            
        Raises:
            NotFoundError: If document not found
        """
        # Check cache first
        if self.cache:
            cached = self.cache.get_cached_document(name)
            if cached:
                return cached
        
        # Query database
        document = self.db.query(Document).filter(Document.name == name).first()
        if not document:
            raise NotFoundError("Document", name)
        
        # Cache the result
        if self.cache:
            self.cache.cache_document(document)
        
        return document
    
    def get_by_id(self, doc_id: int) -> Document:
        """
        Get document by ID.
        
        Args:
            doc_id: Document ID
            
        Returns:
            Document instance
            
        Raises:
            NotFoundError: If document not found
        """
        document = self.db.query(Document).filter(Document.id == doc_id).first()
        if not document:
            raise NotFoundError("Document", doc_id)
        return document
    
    def list_documents(
        self,
        category: Optional[str] = None,
        section: Optional[int] = None,
        is_common: Optional[bool] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[Document]:
        """
        List documents with optional filters.
        
        Args:
            category: Filter by category
            section: Filter by section number
            is_common: Filter by common flag
            limit: Maximum results
            offset: Pagination offset
            
        Returns:
            List of documents
        """
        query = self.db.query(Document)
        
        # Apply filters
        if category:
            query = query.filter(Document.category == category)
        
        if section is not None:
            query = query.filter(Document.section == section)
        
        if is_common is not None:
            query = query.filter(Document.is_common == is_common)
        
        # Apply pagination
        documents = query.order_by(Document.name).limit(limit).offset(offset).all()
        
        return documents
    
    def get_document_count(
        self,
        category: Optional[str] = None,
        section: Optional[int] = None
    ) -> int:
        """
        Get total document count with optional filters.
        
        Args:
            category: Filter by category
            section: Filter by section number
            
        Returns:
            Total count
        """
        query = self.db.query(func.count(Document.id))
        
        if category:
            query = query.filter(Document.category == category)
        
        if section is not None:
            query = query.filter(Document.section == section)
        
        return query.scalar() or 0
    
    def get_categories(self) -> List[str]:
        """
        Get all unique categories.
        
        Returns:
            List of category names
        """
        categories = (
            self.db.query(Document.category)
            .distinct()
            .filter(Document.category.isnot(None))
            .order_by(Document.category)
            .all()
        )
        return [cat[0] for cat in categories]
    
    def get_sections(self) -> List[int]:
        """
        Get all unique section numbers.
        
        Returns:
            List of section numbers
        """
        sections = (
            self.db.query(Document.section)
            .distinct()
            .filter(Document.section.isnot(None))
            .order_by(Document.section)
            .all()
        )
        return [sec[0] for sec in sections]
    
    def create_or_update(self, document_data: Dict[str, Any]) -> Document:
        """
        Create or update a document.
        
        Args:
            document_data: Document data dictionary
            
        Returns:
            Created or updated document
        """
        name = document_data.get('name')
        if not name:
            raise ValidationError("Document name is required")
        
        # Check if exists
        existing = self.db.query(Document).filter(Document.name == name).first()
        
        if existing:
            # Update existing
            for key, value in document_data.items():
                if hasattr(existing, key):
                    setattr(existing, key, value)
            document = existing
        else:
            # Create new
            document = Document(**document_data)
            self.db.add(document)
        
        self.commit()
        
        # Invalidate cache
        if self.cache:
            self.cache.invalidate_document(name)
        
        return document
    
    def get_popular_documents(self, limit: int = 10) -> List[Document]:
        """
        Get most popular documents based on access count.
        
        Args:
            limit: Maximum results
            
        Returns:
            List of popular documents
        """
        documents = (
            self.db.query(Document)
            .filter(Document.access_count > 0)
            .order_by(Document.access_count.desc())
            .limit(limit)
            .all()
        )
        return documents
    
    def increment_access_count(self, name: str) -> None:
        """
        Increment document access count.
        
        Args:
            name: Document name
        """
        self.db.query(Document).filter(Document.name == name).update(
            {Document.access_count: Document.access_count + 1}
        )
        self.commit()
    
    def get_related_documents(self, document: Document, limit: int = 5) -> List[Document]:
        """
        Get related documents based on category and keywords.
        
        Args:
            document: Source document
            limit: Maximum results
            
        Returns:
            List of related documents
        """
        # Simple implementation - get documents from same category
        related = (
            self.db.query(Document)
            .filter(
                Document.id != document.id,
                or_(
                    Document.category == document.category,
                    Document.section == document.section
                )
            )
            .order_by(Document.access_count.desc())
            .limit(limit)
            .all()
        )
        return related