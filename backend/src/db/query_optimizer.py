"""
Query optimization utilities to prevent N+1 queries and improve performance.
"""

from sqlalchemy.orm import Session, joinedload, selectinload, subqueryload
from sqlalchemy import and_, or_, func
from typing import List, Optional, Dict, Any
import logging

from ..models.document import Document, Section, Subsection
from ..models.user import User, Favorite, SearchHistory

logger = logging.getLogger(__name__)


class QueryOptimizer:
    """Optimize database queries to prevent N+1 issues and improve performance."""
    
    @staticmethod
    def get_document_with_sections(db: Session, doc_id: int) -> Optional[Document]:
        """
        Get a document with all its sections and subsections in a single query.
        """
        return db.query(Document).options(
            selectinload(Document.sections).selectinload(Section.subsections),
            selectinload(Document.related_documents)
        ).filter(Document.id == doc_id).first()
    
    @staticmethod
    def get_documents_with_sections(
        db: Session, 
        doc_ids: List[int]
    ) -> List[Document]:
        """
        Get multiple documents with their sections efficiently.
        """
        return db.query(Document).options(
            selectinload(Document.sections).selectinload(Section.subsections)
        ).filter(Document.id.in_(doc_ids)).all()
    
    @staticmethod
    def search_documents_optimized(
        db: Session,
        query: str,
        section: Optional[str] = None,
        category: Optional[str] = None,
        limit: int = 20,
        offset: int = 0
    ) -> tuple[List[Document], int]:
        """
        Optimized search query that avoids N+1 issues.
        """
        # Base query with eager loading
        base_query = db.query(Document).options(
            selectinload(Document.sections)
        )
        
        # Apply filters
        if query:
            search_pattern = f"%{query}%"
            base_query = base_query.filter(
                or_(
                    Document.name.ilike(search_pattern),
                    Document.title.ilike(search_pattern),
                    Document.summary.ilike(search_pattern)
                )
            )
        
        if section:
            base_query = base_query.filter(Document.section == section)
        
        if category:
            base_query = base_query.filter(Document.category == category)
        
        # Get total count
        total = base_query.count()
        
        # Get paginated results
        documents = base_query.order_by(
            Document.priority.asc().nullsfirst(),
            Document.name.asc()
        ).offset(offset).limit(limit).all()
        
        return documents, total
    
    @staticmethod
    def get_user_favorites_optimized(
        db: Session,
        user_id: int,
        limit: int = 50,
        offset: int = 0
    ) -> List[Favorite]:
        """
        Get user favorites with documents pre-loaded.
        """
        return db.query(Favorite).options(
            joinedload(Favorite.document).selectinload(Document.sections)
        ).filter(
            Favorite.user_id == user_id
        ).order_by(
            Favorite.created_at.desc()
        ).offset(offset).limit(limit).all()
    
    @staticmethod
    def get_popular_documents(
        db: Session,
        limit: int = 10,
        days: int = 7
    ) -> List[Dict[str, Any]]:
        """
        Get popular documents with aggregated statistics.
        """
        # Use a single query with aggregation
        popular = db.query(
            Document.id,
            Document.name,
            Document.title,
            Document.section,
            Document.access_count,
            func.count(Favorite.id).label('favorite_count')
        ).outerjoin(
            Favorite
        ).group_by(
            Document.id
        ).order_by(
            Document.access_count.desc()
        ).limit(limit).all()
        
        return [
            {
                "id": doc.id,
                "name": doc.name,
                "title": doc.title,
                "section": doc.section,
                "access_count": doc.access_count,
                "favorite_count": doc.favorite_count
            }
            for doc in popular
        ]
    
    @staticmethod
    def batch_update_access_counts(
        db: Session,
        doc_ids: List[int]
    ):
        """
        Batch update access counts to avoid multiple queries.
        """
        if not doc_ids:
            return
        
        # Use bulk update
        db.query(Document).filter(
            Document.id.in_(doc_ids)
        ).update(
            {Document.access_count: Document.access_count + 1},
            synchronize_session=False
        )
        
        db.commit()
    
    @staticmethod
    def get_documents_by_category(
        db: Session,
        category: str,
        include_sections: bool = False
    ) -> List[Document]:
        """
        Get all documents in a category with optional section loading.
        """
        query = db.query(Document).filter(Document.category == category)
        
        if include_sections:
            query = query.options(
                selectinload(Document.sections).selectinload(Section.subsections)
            )
        
        return query.order_by(Document.name).all()
    
    @staticmethod
    def prefetch_common_documents(db: Session) -> Dict[str, Document]:
        """
        Prefetch common documents to avoid repeated queries.
        """
        common_docs = db.query(Document).options(
            selectinload(Document.sections)
        ).filter(
            Document.is_common == True
        ).all()
        
        return {doc.name: doc for doc in common_docs}
    
    @staticmethod
    def get_user_with_stats(db: Session, user_id: int) -> Optional[Dict[str, Any]]:
        """
        Get user with aggregated statistics in a single query.
        """
        # Get user with counts
        result = db.query(
            User,
            func.count(func.distinct(Favorite.id)).label('favorites_count'),
            func.count(func.distinct(SearchHistory.id)).label('searches_count')
        ).outerjoin(
            Favorite, User.id == Favorite.user_id
        ).outerjoin(
            SearchHistory, User.id == SearchHistory.user_id
        ).filter(
            User.id == user_id
        ).group_by(
            User.id
        ).first()
        
        if not result:
            return None
        
        user, fav_count, search_count = result
        
        return {
            "user": user,
            "favorites_count": fav_count,
            "searches_count": search_count
        }
    
    @staticmethod
    def optimize_query_with_explain(db: Session, query):
        """
        Helper to analyze query performance (PostgreSQL).
        """
        try:
            # Only works with PostgreSQL
            explain = db.execute(f"EXPLAIN ANALYZE {query}")
            for row in explain:
                logger.info(f"Query plan: {row}")
        except Exception as e:
            logger.debug(f"Could not explain query: {e}")


# Query optimization decorators
def optimize_document_query(func):
    """Decorator to automatically optimize document queries."""
    def wrapper(self, db: Session, *args, **kwargs):
        # Set session options for better performance
        db.execute("PRAGMA synchronous = OFF")  # SQLite optimization
        db.execute("PRAGMA cache_size = -64000")  # 64MB cache
        
        # Run the actual function
        result = func(self, db, *args, **kwargs)
        
        # Reset session
        db.execute("PRAGMA synchronous = NORMAL")
        
        return result
    return wrapper