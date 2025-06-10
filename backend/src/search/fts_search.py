"""
Full-text search implementation with performance optimizations.
"""

import re
from typing import List, Dict, Optional, Tuple, Any
from dataclasses import dataclass
from sqlalchemy import text, func, and_, or_
from sqlalchemy.orm import Session
from sqlalchemy.sql import Select

from ..models.document import Document
from ..db.query_performance import query_cache
from ..monitoring_metrics import metrics

import logging
logger = logging.getLogger(__name__)


@dataclass
class FTSResult:
    """Full-text search result."""
    document_id: int
    name: str
    section: str
    title: str
    summary: str
    score: float
    highlight: Optional[str] = None
    matched_sections: Optional[List[str]] = None


class FullTextSearchEngine:
    """
    Optimized full-text search engine with multiple strategies.
    """
    
    def __init__(self, session: Session):
        self.session = session
        self._init_fts_if_needed()
    
    def _init_fts_if_needed(self):
        """Initialize FTS tables if they don't exist."""
        # Check if we're using SQLite
        if self.session.bind.dialect.name == 'sqlite':
            # Create FTS5 virtual table for SQLite
            self.session.execute(text("""
                CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
                    document_id UNINDEXED,
                    name,
                    title,
                    summary,
                    content,
                    content=documents,
                    content_rowid=id,
                    tokenize='porter unicode61'
                )
            """))
            
            # Create triggers to keep FTS table in sync
            self.session.execute(text("""
                CREATE TRIGGER IF NOT EXISTS documents_fts_insert 
                AFTER INSERT ON documents BEGIN
                    INSERT INTO documents_fts(
                        document_id, name, title, summary, content
                    ) VALUES (
                        new.id, new.name, new.title, new.summary, new.raw_content
                    );
                END
            """))
            
            self.session.execute(text("""
                CREATE TRIGGER IF NOT EXISTS documents_fts_update
                AFTER UPDATE ON documents BEGIN
                    UPDATE documents_fts SET
                        name = new.name,
                        title = new.title,
                        summary = new.summary,
                        content = new.raw_content
                    WHERE document_id = new.id;
                END
            """))
            
            self.session.execute(text("""
                CREATE TRIGGER IF NOT EXISTS documents_fts_delete
                AFTER DELETE ON documents BEGIN
                    DELETE FROM documents_fts WHERE document_id = old.id;
                END
            """))
            
            self.session.commit()
    
    @query_cache(ttl=300)  # Cache for 5 minutes
    def search(
        self,
        query: str,
        section: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
        min_score: float = 0.1,
    ) -> Tuple[List[FTSResult], int]:
        """
        Perform full-text search with ranking.
        """
        with metrics.timer('search_duration'):
            # Clean and prepare query
            cleaned_query = self._clean_query(query)
            
            if self.session.bind.dialect.name == 'sqlite':
                results, total = self._sqlite_fts_search(
                    cleaned_query, section, limit, offset, min_score
                )
            elif self.session.bind.dialect.name == 'postgresql':
                results, total = self._postgres_fts_search(
                    cleaned_query, section, limit, offset, min_score
                )
            else:
                # Fallback to LIKE search
                results, total = self._fallback_search(
                    cleaned_query, section, limit, offset
                )
            
            metrics.search_queries_total.inc()
            return results, total
    
    def _clean_query(self, query: str) -> str:
        """Clean and normalize search query."""
        # Remove special characters except spaces and alphanumeric
        cleaned = re.sub(r'[^\w\s-]', ' ', query)
        # Normalize whitespace
        cleaned = ' '.join(cleaned.split())
        return cleaned.strip()
    
    def _sqlite_fts_search(
        self,
        query: str,
        section: Optional[str],
        limit: int,
        offset: int,
        min_score: float,
    ) -> Tuple[List[FTSResult], int]:
        """SQLite FTS5 search implementation."""
        # Build FTS query
        fts_query = self._build_fts_query(query)
        
        # Base query for results
        base_sql = """
            SELECT 
                d.id,
                d.name,
                d.section,
                d.title,
                d.summary,
                -rank as score,
                snippet(documents_fts, 4, '<mark>', '</mark>', '...', 32) as highlight
            FROM documents_fts
            JOIN documents d ON documents_fts.document_id = d.id
            WHERE documents_fts MATCH :query
        """
        
        # Add section filter if specified
        if section and section != 'all':
            base_sql += " AND d.section = :section"
        
        # Add ordering and pagination
        sql = base_sql + """
            ORDER BY rank
            LIMIT :limit OFFSET :offset
        """
        
        # Count query
        count_sql = f"""
            SELECT COUNT(*) as total
            FROM documents_fts
            JOIN documents d ON documents_fts.document_id = d.id
            WHERE documents_fts MATCH :query
            {" AND d.section = :section" if section and section != 'all' else ""}
        """
        
        # Execute queries
        params = {'query': fts_query, 'limit': limit, 'offset': offset}
        if section and section != 'all':
            params['section'] = section
        
        result = self.session.execute(text(sql), params)
        count_result = self.session.execute(text(count_sql), params)
        
        # Process results
        results = []
        for row in result:
            if row.score >= min_score:
                results.append(FTSResult(
                    document_id=row.id,
                    name=row.name,
                    section=row.section,
                    title=row.title,
                    summary=row.summary,
                    score=row.score,
                    highlight=row.highlight,
                ))
        
        total = count_result.scalar() or 0
        
        return results, total
    
    def _postgres_fts_search(
        self,
        query: str,
        section: Optional[str],
        limit: int,
        offset: int,
        min_score: float,
    ) -> Tuple[List[FTSResult], int]:
        """PostgreSQL full-text search implementation."""
        # Create tsvector and tsquery
        sql = """
            WITH search_query AS (
                SELECT 
                    plainto_tsquery('english', :query) as q,
                    :query as raw_query
            )
            SELECT 
                d.id,
                d.name,
                d.section,
                d.title,
                d.summary,
                ts_rank_cd(
                    setweight(to_tsvector('english', d.name), 'A') ||
                    setweight(to_tsvector('english', d.title), 'B') ||
                    setweight(to_tsvector('english', d.summary), 'C') ||
                    setweight(to_tsvector('english', COALESCE(d.raw_content, '')), 'D'),
                    search_query.q
                ) as score,
                ts_headline(
                    'english',
                    d.summary || ' ' || COALESCE(d.raw_content, ''),
                    search_query.q,
                    'StartSel=<mark>, StopSel=</mark>, MaxWords=35, MinWords=15'
                ) as highlight
            FROM documents d, search_query
            WHERE (
                to_tsvector('english', d.name) @@ search_query.q OR
                to_tsvector('english', d.title) @@ search_query.q OR
                to_tsvector('english', d.summary) @@ search_query.q OR
                to_tsvector('english', COALESCE(d.raw_content, '')) @@ search_query.q
            )
        """
        
        # Add section filter
        if section and section != 'all':
            sql += " AND d.section = :section"
        
        # Add score filter and ordering
        sql += f"""
            AND ts_rank_cd(
                setweight(to_tsvector('english', d.name), 'A') ||
                setweight(to_tsvector('english', d.title), 'B') ||
                setweight(to_tsvector('english', d.summary), 'C') ||
                setweight(to_tsvector('english', COALESCE(d.raw_content, '')), 'D'),
                search_query.q
            ) >= :min_score
            ORDER BY score DESC
            LIMIT :limit OFFSET :offset
        """
        
        # Execute search
        params = {
            'query': query,
            'min_score': min_score,
            'limit': limit,
            'offset': offset,
        }
        if section and section != 'all':
            params['section'] = section
        
        result = self.session.execute(text(sql), params)
        
        # Count total results
        count_sql = """
            WITH search_query AS (
                SELECT plainto_tsquery('english', :query) as q
            )
            SELECT COUNT(*) as total
            FROM documents d, search_query
            WHERE (
                to_tsvector('english', d.name) @@ search_query.q OR
                to_tsvector('english', d.title) @@ search_query.q OR
                to_tsvector('english', d.summary) @@ search_query.q OR
                to_tsvector('english', COALESCE(d.raw_content, '')) @@ search_query.q
            )
        """
        
        if section and section != 'all':
            count_sql += " AND d.section = :section"
        
        count_params = {'query': query}
        if section and section != 'all':
            count_params['section'] = section
        
        count_result = self.session.execute(text(count_sql), count_params)
        total = count_result.scalar() or 0
        
        # Process results
        results = []
        for row in result:
            results.append(FTSResult(
                document_id=row.id,
                name=row.name,
                section=row.section,
                title=row.title,
                summary=row.summary,
                score=float(row.score),
                highlight=row.highlight,
            ))
        
        return results, total
    
    def _fallback_search(
        self,
        query: str,
        section: Optional[str],
        limit: int,
        offset: int,
    ) -> Tuple[List[FTSResult], int]:
        """Fallback search using LIKE for other databases."""
        # Build search conditions
        search_term = f"%{query}%"
        
        # Query documents
        q = self.session.query(Document)
        
        # Add search conditions
        q = q.filter(
            or_(
                Document.name.ilike(search_term),
                Document.title.ilike(search_term),
                Document.summary.ilike(search_term),
            )
        )
        
        # Add section filter
        if section and section != 'all':
            q = q.filter(Document.section == section)
        
        # Get total count
        total = q.count()
        
        # Apply pagination
        documents = q.offset(offset).limit(limit).all()
        
        # Convert to results
        results = []
        for doc in documents:
            # Simple scoring based on where match occurs
            score = 0.0
            if query.lower() in doc.name.lower():
                score += 1.0
            if query.lower() in doc.title.lower():
                score += 0.8
            if query.lower() in doc.summary.lower():
                score += 0.5
            
            results.append(FTSResult(
                document_id=doc.id,
                name=doc.name,
                section=doc.section,
                title=doc.title,
                summary=doc.summary,
                score=score,
            ))
        
        # Sort by score
        results.sort(key=lambda x: x.score, reverse=True)
        
        return results, total
    
    def _build_fts_query(self, query: str) -> str:
        """Build FTS query string."""
        # Split into words
        words = query.split()
        
        # Handle special operators
        if len(words) == 1:
            # Single word - use prefix matching
            return f"{words[0]}*"
        else:
            # Multiple words - use phrase matching with OR
            parts = []
            
            # Add exact phrase
            parts.append(f'"{query}"')
            
            # Add individual words with prefix matching
            for word in words:
                if len(word) > 2:  # Skip short words
                    parts.append(f"{word}*")
            
            return " OR ".join(parts)
    
    def suggest(self, prefix: str, limit: int = 10) -> List[str]:
        """Get search suggestions based on prefix."""
        if len(prefix) < 2:
            return []
        
        # Use FTS for suggestions
        if self.session.bind.dialect.name == 'sqlite':
            sql = """
                SELECT DISTINCT name
                FROM documents_fts
                WHERE name MATCH :prefix
                ORDER BY rank
                LIMIT :limit
            """
            params = {'prefix': f"{prefix}*", 'limit': limit}
        else:
            # Fallback to LIKE
            sql = """
                SELECT DISTINCT name
                FROM documents
                WHERE name LIKE :prefix
                ORDER BY name
                LIMIT :limit
            """
            params = {'prefix': f"{prefix}%", 'limit': limit}
        
        result = self.session.execute(text(sql), params)
        return [row[0] for row in result]
    
    def rebuild_index(self):
        """Rebuild the full-text search index."""
        if self.session.bind.dialect.name == 'sqlite':
            # Rebuild FTS5 index
            self.session.execute(text("INSERT INTO documents_fts(documents_fts) VALUES('rebuild')"))
            self.session.commit()
            logger.info("FTS index rebuilt successfully")
        elif self.session.bind.dialect.name == 'postgresql':
            # Reindex PostgreSQL FTS indexes
            self.session.execute(text("REINDEX INDEX CONCURRENTLY idx_documents_fts"))
            self.session.commit()
            logger.info("PostgreSQL FTS index rebuilt successfully")