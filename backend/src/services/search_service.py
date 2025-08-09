"""
Search service for advanced document searching.
"""

from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
import logging

from .base import BaseService
from ..models.document import Document
from ..search.search_engine import SearchEngine
from ..search.advanced_search import AdvancedSearchEngine
from ..search.optimized_search import OptimizedSearchEngine
from ..errors import SearchError


class SearchService(BaseService[Document]):
    """Service for document search operations."""
    
    def __init__(self, db: Session):
        """
        Initialize search service.
        
        Args:
            db: Database session
        """
        super().__init__(db)
        self.logger = logging.getLogger(__name__)
        
        # Initialize search engines
        self.basic_engine = SearchEngine(db)
        self.advanced_engine = AdvancedSearchEngine(db)
        self.optimized_engine = OptimizedSearchEngine(db)
        
        # Determine which engine to use based on capabilities
        self._select_engine()
    
    def _select_engine(self):
        """Select the best available search engine."""
        try:
            # Try to use optimized engine first
            if self.optimized_engine.check_fts_availability():
                self.primary_engine = self.optimized_engine
                self.logger.info("Using optimized search engine with FTS")
            else:
                # Fallback to advanced engine
                self.primary_engine = self.advanced_engine
                self.logger.info("Using advanced search engine")
        except Exception as e:
            # Final fallback to basic engine
            self.primary_engine = self.basic_engine
            self.logger.warning(f"Falling back to basic search engine: {e}")
    
    def search(
        self,
        query: str,
        section: Optional[int] = None,
        category: Optional[str] = None,
        doc_set: Optional[str] = None,
        page: int = 1,
        per_page: int = 10,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Perform document search.
        
        Args:
            query: Search query
            section: Filter by section
            category: Filter by category
            doc_set: Filter by document set
            page: Page number
            per_page: Results per page
            **kwargs: Additional search parameters
            
        Returns:
            Search results dictionary
        """
        if not query or not query.strip():
            raise SearchError("Search query cannot be empty")
        
        try:
            # Use primary engine
            results = self.primary_engine.search(
                query=query,
                section=section,
                doc_set=doc_set,
                page=page,
                per_page=per_page
            )
            
            # Add category filter if provided
            if category and 'results' in results:
                filtered_results = []
                for result in results['results']:
                    # Fetch document to check category
                    doc = self.db.query(Document).filter(
                        Document.name == result.get('id', result.get('name'))
                    ).first()
                    if doc and doc.category == category:
                        filtered_results.append(result)
                
                results['results'] = filtered_results
                results['total'] = len(filtered_results)
            
            return results
            
        except Exception as e:
            self.logger.error(f"Search error: {e}")
            # Try fallback engine
            if self.primary_engine != self.basic_engine:
                self.logger.info("Trying fallback search engine")
                try:
                    return self.basic_engine.search(
                        query=query,
                        section=section,
                        doc_set=doc_set,
                        page=page,
                        per_page=per_page
                    )
                except Exception as fallback_error:
                    self.logger.error(f"Fallback search also failed: {fallback_error}")
            
            raise SearchError(f"Search failed: {str(e)}", query)
    
    def suggest(
        self,
        prefix: str,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Get search suggestions based on prefix.
        
        Args:
            prefix: Search prefix
            limit: Maximum suggestions
            
        Returns:
            List of suggestions
        """
        if not prefix or len(prefix) < 2:
            return []
        
        try:
            # Get documents matching prefix
            documents = (
                self.db.query(Document)
                .filter(
                    Document.name.like(f"{prefix}%") |
                    Document.title.like(f"{prefix}%")
                )
                .order_by(Document.access_count.desc())
                .limit(limit)
                .all()
            )
            
            suggestions = []
            for doc in documents:
                suggestions.append({
                    'name': doc.name,
                    'title': doc.title,
                    'section': doc.section,
                    'summary': doc.summary,
                    'type': 'command'
                })
            
            return suggestions
            
        except Exception as e:
            self.logger.error(f"Suggestion error: {e}")
            return []
    
    def get_search_stats(self) -> Dict[str, Any]:
        """
        Get search engine statistics.
        
        Returns:
            Statistics dictionary
        """
        stats = {
            'engine': self.primary_engine.__class__.__name__,
            'capabilities': {
                'fts': hasattr(self.primary_engine, 'has_fts') and self.primary_engine.has_fts,
                'fuzzy': hasattr(self.primary_engine, 'supports_fuzzy'),
                'ranking': True
            }
        }
        
        # Add index stats if available
        if hasattr(self.primary_engine, 'get_index_stats'):
            stats['index'] = self.primary_engine.get_index_stats()
        
        return stats
    
    def rebuild_search_index(self) -> bool:
        """
        Rebuild search index if supported.
        
        Returns:
            Success status
        """
        if hasattr(self.primary_engine, 'rebuild_index'):
            try:
                self.primary_engine.rebuild_index()
                self.logger.info("Search index rebuilt successfully")
                return True
            except Exception as e:
                self.logger.error(f"Failed to rebuild search index: {e}")
                return False
        else:
            self.logger.info("Search engine does not support index rebuild")
            return False