"""
Unified search engine combining best features of all search implementations.
"""

from typing import List, Optional, Dict, Any, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import text, or_, and_, func
import re
import logging
from datetime import datetime

from ..models.document import Document
from ..errors import SearchError


class UnifiedSearchEngine:
    """
    Unified search engine with multiple strategies and automatic fallback.
    
    Features:
    - Full-text search with PostgreSQL/SQLite FTS
    - Fuzzy matching with trigrams
    - Smart ranking algorithm
    - Query optimization
    - Automatic fallback strategies
    """
    
    def __init__(self, db: Session):
        """Initialize unified search engine."""
        self.db = db
        self.logger = logging.getLogger(__name__)
        self._detect_capabilities()
    
    def _detect_capabilities(self):
        """Detect database capabilities for search."""
        self.has_fts5 = False
        self.has_postgresql = False
        self.has_trigram = False
        
        # Detect database type
        try:
            result = self.db.execute(text("SELECT version()")).scalar()
            if 'PostgreSQL' in str(result):
                self.has_postgresql = True
                
                # Check for trigram extension
                try:
                    self.db.execute(text("SELECT 'test'::text % 'test'"))
                    self.has_trigram = True
                except:
                    pass
        except:
            # SQLite
            try:
                self.db.execute(text("SELECT fts5_version()"))
                self.has_fts5 = True
            except:
                pass
        
        self.logger.info(
            f"Search capabilities - PostgreSQL: {self.has_postgresql}, "
            f"FTS5: {self.has_fts5}, Trigram: {self.has_trigram}"
        )
    
    def search(
        self,
        query: str,
        filters: Optional[Dict[str, Any]] = None,
        page: int = 1,
        per_page: int = 10,
        ranking: str = 'relevance'
    ) -> Dict[str, Any]:
        """
        Perform unified search with automatic strategy selection.
        
        Args:
            query: Search query
            filters: Optional filters (section, category, etc.)
            page: Page number (1-indexed)
            per_page: Results per page
            ranking: Ranking strategy ('relevance', 'recent', 'popular')
            
        Returns:
            Search results with metadata
        """
        if not query or not query.strip():
            raise SearchError("Empty search query")
        
        # Clean and prepare query
        query = query.strip()
        start_time = datetime.utcnow()
        
        # Choose search strategy based on capabilities
        if self.has_postgresql and self.has_trigram:
            results = self._postgresql_search(query, filters, page, per_page, ranking)
        elif self.has_fts5:
            results = self._sqlite_fts_search(query, filters, page, per_page, ranking)
        else:
            results = self._fallback_search(query, filters, page, per_page, ranking)
        
        # Add search metadata
        results['query'] = query
        results['search_time_ms'] = int((datetime.utcnow() - start_time).total_seconds() * 1000)
        results['strategy'] = self._get_strategy_name()
        
        return results
    
    def _postgresql_search(
        self,
        query: str,
        filters: Optional[Dict[str, Any]],
        page: int,
        per_page: int,
        ranking: str
    ) -> Dict[str, Any]:
        """PostgreSQL search with full-text and trigram support."""
        offset = (page - 1) * per_page
        
        # Build search query with ranking
        search_sql = """
        WITH search_results AS (
            SELECT 
                d.*,
                -- Full-text search rank
                ts_rank(
                    to_tsvector('english', d.name || ' ' || COALESCE(d.title, '') || ' ' || COALESCE(d.summary, '')),
                    plainto_tsquery('english', :query)
                ) as fts_rank,
                -- Trigram similarity
                similarity(d.name, :query) as name_similarity,
                similarity(COALESCE(d.title, ''), :query) as title_similarity,
                -- Exact match boost
                CASE 
                    WHEN LOWER(d.name) = LOWER(:query) THEN 10
                    WHEN LOWER(d.name) LIKE LOWER(:query) || '%' THEN 5
                    ELSE 0
                END as exact_boost,
                -- Popularity factor
                LOG(GREATEST(d.access_count, 1)) as popularity_score
            FROM documents d
            WHERE (
                -- Full-text search
                to_tsvector('english', d.name || ' ' || COALESCE(d.title, '') || ' ' || COALESCE(d.summary, ''))
                @@ plainto_tsquery('english', :query)
                OR
                -- Trigram similarity
                d.name % :query
                OR d.title % :query
                OR
                -- Fallback LIKE search
                d.name ILIKE '%' || :query || '%'
                OR d.title ILIKE '%' || :query || '%'
            )
        """
        
        # Add filters
        filter_conditions = []
        params = {'query': query}
        
        if filters:
            if 'section' in filters and filters['section']:
                filter_conditions.append("d.section = :section")
                params['section'] = filters['section']
            
            if 'category' in filters and filters['category']:
                filter_conditions.append("d.category = :category")
                params['category'] = filters['category']
        
        if filter_conditions:
            search_sql += " AND " + " AND ".join(filter_conditions)
        
        # Add ranking
        if ranking == 'recent':
            order_by = "d.updated_at DESC"
        elif ranking == 'popular':
            order_by = "popularity_score DESC"
        else:  # relevance
            order_by = """
                (fts_rank * 2 + 
                 name_similarity * 3 + 
                 title_similarity * 1.5 + 
                 exact_boost +
                 popularity_score * 0.1) DESC
            """
        
        search_sql += f"""
        )
        SELECT * FROM search_results
        ORDER BY {order_by}
        LIMIT :limit OFFSET :offset
        """
        
        # Count query
        count_sql = """
        SELECT COUNT(*) FROM documents d
        WHERE (
            to_tsvector('english', d.name || ' ' || COALESCE(d.title, '') || ' ' || COALESCE(d.summary, ''))
            @@ plainto_tsquery('english', :query)
            OR d.name % :query
            OR d.title % :query
            OR d.name ILIKE '%' || :query || '%'
            OR d.title ILIKE '%' || :query || '%'
        )
        """
        
        if filter_conditions:
            count_sql += " AND " + " AND ".join(filter_conditions)
        
        # Execute queries
        params.update({'limit': per_page, 'offset': offset})
        
        results = self.db.execute(text(search_sql), params).fetchall()
        total = self.db.execute(text(count_sql), params).scalar() or 0
        
        # Format results
        formatted_results = []
        for row in results:
            result = {
                'id': row.name,
                'name': row.name,
                'title': row.title,
                'section': row.section,
                'summary': row.summary,
                'score': float(row.fts_rank) if hasattr(row, 'fts_rank') else 1.0,
                'highlights': self._extract_highlights(row, query)
            }
            formatted_results.append(result)
        
        return {
            'results': formatted_results,
            'total': total,
            'page': page,
            'per_page': per_page,
            'pages': (total + per_page - 1) // per_page
        }
    
    def _sqlite_fts_search(
        self,
        query: str,
        filters: Optional[Dict[str, Any]],
        page: int,
        per_page: int,
        ranking: str
    ) -> Dict[str, Any]:
        """SQLite FTS5 search implementation."""
        offset = (page - 1) * per_page
        
        # Prepare FTS query
        fts_query = self._prepare_fts_query(query)
        
        # Build search query
        search_sql = """
        SELECT 
            d.*,
            fts.rank as fts_rank
        FROM documents d
        JOIN fts_documents fts ON d.id = fts.rowid
        WHERE fts_documents MATCH :query
        """
        
        params = {'query': fts_query}
        
        # Add filters
        if filters:
            if 'section' in filters and filters['section']:
                search_sql += " AND d.section = :section"
                params['section'] = filters['section']
            
            if 'category' in filters and filters['category']:
                search_sql += " AND d.category = :category"
                params['category'] = filters['category']
        
        # Add ordering
        if ranking == 'recent':
            search_sql += " ORDER BY d.updated_at DESC"
        elif ranking == 'popular':
            search_sql += " ORDER BY d.access_count DESC"
        else:
            search_sql += " ORDER BY fts.rank"
        
        search_sql += " LIMIT :limit OFFSET :offset"
        params.update({'limit': per_page, 'offset': offset})
        
        # Execute search
        results = self.db.execute(text(search_sql), params).fetchall()
        
        # Get total count
        count_sql = """
        SELECT COUNT(*) FROM documents d
        JOIN fts_documents fts ON d.id = fts.rowid
        WHERE fts_documents MATCH :query
        """
        
        if filters:
            if 'section' in filters and filters['section']:
                count_sql += " AND d.section = :section"
            if 'category' in filters and filters['category']:
                count_sql += " AND d.category = :category"
        
        total = self.db.execute(text(count_sql), params).scalar() or 0
        
        # Format results
        formatted_results = []
        for row in results:
            result = {
                'id': row.name,
                'name': row.name,
                'title': row.title,
                'section': row.section,
                'summary': row.summary,
                'score': abs(float(row.fts_rank)) if hasattr(row, 'fts_rank') else 1.0,
                'highlights': self._extract_highlights(row, query)
            }
            formatted_results.append(result)
        
        return {
            'results': formatted_results,
            'total': total,
            'page': page,
            'per_page': per_page,
            'pages': (total + per_page - 1) // per_page
        }
    
    def _fallback_search(
        self,
        query: str,
        filters: Optional[Dict[str, Any]],
        page: int,
        per_page: int,
        ranking: str
    ) -> Dict[str, Any]:
        """Basic LIKE search fallback."""
        offset = (page - 1) * per_page
        
        # Build query
        base_query = self.db.query(Document)
        
        # Add search conditions
        search_pattern = f"%{query}%"
        base_query = base_query.filter(
            or_(
                Document.name.ilike(search_pattern),
                Document.title.ilike(search_pattern),
                Document.summary.ilike(search_pattern)
            )
        )
        
        # Add filters
        if filters:
            if 'section' in filters and filters['section']:
                base_query = base_query.filter(Document.section == filters['section'])
            
            if 'category' in filters and filters['category']:
                base_query = base_query.filter(Document.category == filters['category'])
        
        # Get total count
        total = base_query.count()
        
        # Add ordering
        if ranking == 'recent':
            base_query = base_query.order_by(Document.updated_at.desc())
        elif ranking == 'popular':
            base_query = base_query.order_by(Document.access_count.desc())
        else:
            # Simple relevance: prefer exact matches
            base_query = base_query.order_by(
                Document.name.ilike(query).desc(),
                Document.name
            )
        
        # Get results
        results = base_query.offset(offset).limit(per_page).all()
        
        # Format results
        formatted_results = []
        for doc in results:
            result = {
                'id': doc.name,
                'name': doc.name,
                'title': doc.title,
                'section': doc.section,
                'summary': doc.summary,
                'score': self._calculate_simple_score(doc, query),
                'highlights': self._extract_highlights(doc, query)
            }
            formatted_results.append(result)
        
        return {
            'results': formatted_results,
            'total': total,
            'page': page,
            'per_page': per_page,
            'pages': (total + per_page - 1) // per_page
        }
    
    def _prepare_fts_query(self, query: str) -> str:
        """Prepare query for FTS."""
        # Remove special characters
        query = re.sub(r'[^\w\s-]', ' ', query)
        
        # Handle multiple words
        words = query.split()
        if len(words) > 1:
            # Use phrase search for multi-word queries
            return f'"{query}"'
        
        return query
    
    def _calculate_simple_score(self, doc: Document, query: str) -> float:
        """Calculate simple relevance score."""
        score = 0.0
        query_lower = query.lower()
        
        # Exact name match
        if doc.name.lower() == query_lower:
            score += 10.0
        elif doc.name.lower().startswith(query_lower):
            score += 5.0
        elif query_lower in doc.name.lower():
            score += 2.0
        
        # Title match
        if doc.title and query_lower in doc.title.lower():
            score += 1.0
        
        # Summary match
        if doc.summary and query_lower in doc.summary.lower():
            score += 0.5
        
        # Popularity boost
        if doc.access_count:
            score += min(doc.access_count / 1000, 1.0)
        
        return score
    
    def _extract_highlights(self, doc: Any, query: str) -> List[str]:
        """Extract highlighted snippets from document."""
        highlights = []
        query_lower = query.lower()
        
        # Check in summary
        if hasattr(doc, 'summary') and doc.summary:
            summary_lower = doc.summary.lower()
            if query_lower in summary_lower:
                # Find context around match
                pos = summary_lower.find(query_lower)
                start = max(0, pos - 40)
                end = min(len(doc.summary), pos + len(query) + 40)
                
                snippet = doc.summary[start:end]
                if start > 0:
                    snippet = "..." + snippet
                if end < len(doc.summary):
                    snippet = snippet + "..."
                
                highlights.append(snippet)
        
        return highlights[:3]  # Limit to 3 highlights
    
    def _get_strategy_name(self) -> str:
        """Get current search strategy name."""
        if self.has_postgresql and self.has_trigram:
            return "postgresql_fulltext_trigram"
        elif self.has_fts5:
            return "sqlite_fts5"
        else:
            return "basic_like"
    
    def suggest(self, prefix: str, limit: int = 10) -> List[Dict[str, Any]]:
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
        
        # Query for suggestions
        suggestions_query = self.db.query(
            Document.name,
            Document.title,
            Document.section,
            Document.summary
        ).filter(
            or_(
                Document.name.ilike(f"{prefix}%"),
                Document.title.ilike(f"{prefix}%")
            )
        ).order_by(
            Document.access_count.desc()
        ).limit(limit)
        
        suggestions = []
        for doc in suggestions_query:
            suggestions.append({
                'name': doc.name,
                'title': doc.title,
                'section': doc.section,
                'summary': doc.summary[:100] if doc.summary else None,
                'type': 'command'
            })
        
        return suggestions