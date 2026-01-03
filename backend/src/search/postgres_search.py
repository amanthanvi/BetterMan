"""
Enhanced PostgreSQL search with full-text search and fuzzy matching.
"""

import logging
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import text, func, or_, and_
from dataclasses import dataclass
import re

logger = logging.getLogger(__name__)


@dataclass
class SearchResult:
    """Search result with relevance scoring."""
    id: str
    name: str
    section: str
    title: str
    description: str
    category: str
    score: float
    highlights: List[str]
    match_type: str  # 'exact', 'fuzzy', 'fts'


class PostgreSQLSearchEngine:
    """
    PostgreSQL search engine with multiple strategies:
    1. Exact name match (highest priority)
    2. Full-text search with ranking
    3. Fuzzy matching with pg_trgm
    4. Prefix matching for command completion
    """
    
    def __init__(self, db: Session):
        self.db = db
        self._ensure_extensions()
        self._create_indexes()
    
    def _ensure_extensions(self):
        """Ensure required PostgreSQL extensions are installed."""
        try:
            # Enable pg_trgm for fuzzy matching
            self.db.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
            # Enable unaccent for better text matching
            self.db.execute(text("CREATE EXTENSION IF NOT EXISTS unaccent"))
            self.db.commit()
            logger.info("PostgreSQL extensions enabled: pg_trgm, unaccent")
        except Exception as e:
            logger.warning(f"Could not enable PostgreSQL extensions: {e}")
            self.db.rollback()
    
    def _create_indexes(self):
        """Create optimized indexes for search."""
        try:
            # GIN index for trigram similarity (fuzzy search)
            self.db.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_man_pages_name_trgm 
                ON man_pages USING gin (name gin_trgm_ops)
            """))
            
            # GIN index for full-text search
            self.db.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_man_pages_search_vector 
                ON man_pages USING gin (search_vector)
            """))
            
            # B-tree index for exact matches
            self.db.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_man_pages_name_exact 
                ON man_pages (lower(name))
            """))
            
            # Index for category filtering
            self.db.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_man_pages_category 
                ON man_pages (category)
            """))
            
            self.db.commit()
            logger.info("Search indexes created successfully")
        except Exception as e:
            logger.warning(f"Could not create all indexes: {e}")
            self.db.rollback()
    
    def search(
        self,
        query: str,
        limit: int = 20,
        offset: int = 0,
        categories: Optional[List[str]] = None,
        sections: Optional[List[str]] = None,
        fuzzy_threshold: float = 0.3
    ) -> Tuple[List[SearchResult], int]:
        """
        Perform multi-strategy search with relevance ranking.
        
        Args:
            query: Search query
            limit: Maximum results to return
            offset: Pagination offset
            categories: Filter by categories
            sections: Filter by sections
            fuzzy_threshold: Minimum similarity for fuzzy matches (0-1)
            
        Returns:
            Tuple of (results, total_count)
        """
        if not query or not query.strip():
            return [], 0
        
        query = query.strip().lower()
        results = []
        
        # Strategy 1: Exact name match (highest priority)
        exact_results = self._exact_match(query, categories, sections)
        results.extend(exact_results)
        
        # Strategy 2: Full-text search
        if len(results) < limit:
            fts_results = self._full_text_search(
                query, 
                limit - len(results), 
                categories, 
                sections,
                exclude_ids=[r.id for r in results]
            )
            results.extend(fts_results)
        
        # Strategy 3: Fuzzy matching with pg_trgm
        if len(results) < limit:
            fuzzy_results = self._fuzzy_search(
                query,
                limit - len(results),
                categories,
                sections,
                fuzzy_threshold,
                exclude_ids=[r.id for r in results]
            )
            results.extend(fuzzy_results)
        
        # Apply pagination
        total_count = len(results)
        paginated_results = results[offset:offset + limit]
        
        return paginated_results, total_count
    
    def _exact_match(
        self,
        query: str,
        categories: Optional[List[str]] = None,
        sections: Optional[List[str]] = None
    ) -> List[SearchResult]:
        """Find exact name matches."""
        sql = """
            SELECT 
                id, name, section, title, description, category,
                1.0 as score
            FROM man_pages
            WHERE lower(name) = :query
        """
        
        params = {"query": query}
        conditions = []
        
        if categories:
            conditions.append("category = ANY(:categories)")
            params["categories"] = categories
        
        if sections:
            conditions.append("section = ANY(:sections)")
            params["sections"] = sections
        
        if conditions:
            sql += " AND " + " AND ".join(conditions)
        
        try:
            results = self.db.execute(text(sql), params).fetchall()
            return [
                SearchResult(
                    id=r.id,
                    name=r.name,
                    section=r.section,
                    title=r.title or r.name,
                    description=r.description or "",
                    category=r.category,
                    score=1.0,
                    highlights=[r.name],
                    match_type="exact"
                )
                for r in results
            ]
        except Exception as e:
            logger.error(f"Exact match search error: {e}")
            return []
    
    def _full_text_search(
        self,
        query: str,
        limit: int,
        categories: Optional[List[str]] = None,
        sections: Optional[List[str]] = None,
        exclude_ids: Optional[List[str]] = None
    ) -> List[SearchResult]:
        """Perform PostgreSQL full-text search."""
        sql = """
            SELECT 
                id, name, section, title, description, category,
                ts_rank_cd(search_vector, query) as rank,
                ts_headline('english', 
                    COALESCE(description, '') || ' ' || COALESCE(synopsis, ''),
                    query,
                    'StartSel=<<, StopSel=>>, MaxWords=30, MinWords=10'
                ) as headline
            FROM man_pages,
                 plainto_tsquery('english', :query) query
            WHERE search_vector @@ query
        """
        
        params = {"query": query}
        conditions = []
        
        if categories:
            conditions.append("category = ANY(:categories)")
            params["categories"] = categories
        
        if sections:
            conditions.append("section = ANY(:sections)")
            params["sections"] = sections
        
        if exclude_ids:
            conditions.append("id != ALL(:exclude_ids)")
            params["exclude_ids"] = exclude_ids
        
        if conditions:
            sql += " AND " + " AND ".join(conditions)
        
        sql += " ORDER BY rank DESC LIMIT :limit"
        params["limit"] = limit
        
        try:
            results = self.db.execute(text(sql), params).fetchall()
            search_results = []
            
            for r in results:
                # Extract highlights from headline
                highlights = re.findall(r'<<(.*?)>>', r.headline) if r.headline else []
                
                search_results.append(SearchResult(
                    id=r.id,
                    name=r.name,
                    section=r.section,
                    title=r.title or r.name,
                    description=r.description or "",
                    category=r.category,
                    score=float(r.rank) if r.rank else 0.5,
                    highlights=highlights[:3],  # Limit highlights
                    match_type="fts"
                ))
            
            return search_results
        except Exception as e:
            logger.error(f"Full-text search error: {e}")
            return []
    
    def _fuzzy_search(
        self,
        query: str,
        limit: int,
        categories: Optional[List[str]] = None,
        sections: Optional[List[str]] = None,
        threshold: float = 0.3,
        exclude_ids: Optional[List[str]] = None
    ) -> List[SearchResult]:
        """Perform fuzzy search using trigram similarity."""
        sql = """
            SELECT 
                id, name, section, title, description, category,
                similarity(name, :query) as sim_score,
                name <-> :query as distance
            FROM man_pages
            WHERE similarity(name, :query) > :threshold
        """
        
        params = {"query": query, "threshold": threshold}
        conditions = []
        
        if categories:
            conditions.append("category = ANY(:categories)")
            params["categories"] = categories
        
        if sections:
            conditions.append("section = ANY(:sections)")
            params["sections"] = sections
        
        if exclude_ids:
            conditions.append("id != ALL(:exclude_ids)")
            params["exclude_ids"] = exclude_ids
        
        if conditions:
            sql += " AND " + " AND ".join(conditions)
        
        sql += " ORDER BY sim_score DESC, distance LIMIT :limit"
        params["limit"] = limit
        
        try:
            results = self.db.execute(text(sql), params).fetchall()
            return [
                SearchResult(
                    id=r.id,
                    name=r.name,
                    section=r.section,
                    title=r.title or r.name,
                    description=r.description or "",
                    category=r.category,
                    score=float(r.sim_score),
                    highlights=[self._highlight_fuzzy_match(r.name, query)],
                    match_type="fuzzy"
                )
                for r in results
            ]
        except Exception as e:
            logger.error(f"Fuzzy search error: {e}")
            return []
    
    def _highlight_fuzzy_match(self, text: str, query: str) -> str:
        """Highlight fuzzy match in text."""
        # Simple highlighting for fuzzy matches
        if query.lower() in text.lower():
            pattern = re.compile(re.escape(query), re.IGNORECASE)
            return pattern.sub(f"<<{query}>>", text)
        return text
    
    def autocomplete(self, prefix: str, limit: int = 10) -> List[str]:
        """
        Provide command name autocompletion suggestions.
        
        Args:
            prefix: Command prefix to complete
            limit: Maximum suggestions
            
        Returns:
            List of command names
        """
        if not prefix:
            return []
        
        sql = """
            SELECT DISTINCT name
            FROM man_pages
            WHERE name ILIKE :prefix || '%'
            ORDER BY 
                CASE WHEN is_common THEN 0 ELSE 1 END,
                length(name),
                name
            LIMIT :limit
        """
        
        try:
            results = self.db.execute(
                text(sql),
                {"prefix": prefix, "limit": limit}
            ).fetchall()
            return [r.name for r in results]
        except Exception as e:
            logger.error(f"Autocomplete error: {e}")
            return []
    
    def get_similar_commands(self, command: str, limit: int = 5) -> List[Dict[str, Any]]:
        """
        Find similar commands using trigram similarity.
        
        Args:
            command: Command name to find similarities for
            limit: Maximum similar commands
            
        Returns:
            List of similar commands with similarity scores
        """
        sql = """
            SELECT 
                name,
                section,
                description,
                similarity(name, :command) as sim_score
            FROM man_pages
            WHERE name != :command
              AND similarity(name, :command) > 0.2
            ORDER BY sim_score DESC
            LIMIT :limit
        """
        
        try:
            results = self.db.execute(
                text(sql),
                {"command": command, "limit": limit}
            ).fetchall()
            
            return [
                {
                    "name": r.name,
                    "section": r.section,
                    "description": r.description,
                    "similarity": float(r.sim_score)
                }
                for r in results
            ]
        except Exception as e:
            logger.error(f"Similar commands error: {e}")
            return []