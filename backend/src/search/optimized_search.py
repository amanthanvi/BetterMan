"""
Optimized search engine with improved performance and relevance.
"""

import re
import math
import logging
from typing import List, Dict, Any, Optional, Tuple, Set
from collections import defaultdict
from functools import lru_cache
from sqlalchemy import text, and_, or_, func
from sqlalchemy.orm import Session
from sqlalchemy.dialects import sqlite

from ..models.document import Document, Section
from ..config import get_settings
from ..errors import SearchError

logger = logging.getLogger(__name__)
settings = get_settings()


class SearchScorer:
    """Handles search result scoring and ranking."""
    
    # Field weights for relevance scoring
    FIELD_WEIGHTS = {
        "name_exact": 10.0,      # Exact command name match
        "name_prefix": 5.0,      # Command name starts with query
        "name_contains": 3.0,    # Command name contains query
        "title_exact": 7.0,      # Exact title match
        "title_contains": 2.0,   # Title contains query
        "summary_contains": 1.5, # Summary contains query
        "content_contains": 1.0, # Content contains query
    }
    
    # Section weights (boost common sections)
    SECTION_WEIGHTS = {
        "1": 1.2,  # User commands
        "2": 1.1,  # System calls
        "3": 1.0,  # Library functions
        "8": 1.1,  # System administration
    }
    
    @staticmethod
    def calculate_tf_idf(term_freq: int, doc_length: int, doc_freq: int, total_docs: int) -> float:
        """Calculate TF-IDF score for a term."""
        if doc_length == 0 or doc_freq == 0:
            return 0.0
        
        # Term frequency (normalized)
        tf = term_freq / doc_length
        
        # Inverse document frequency
        idf = math.log((total_docs + 1) / (doc_freq + 1))
        
        return tf * idf
    
    @staticmethod
    def calculate_bm25(
        term_freq: int,
        doc_length: int,
        avg_doc_length: float,
        doc_freq: int,
        total_docs: int,
        k1: float = 1.2,
        b: float = 0.75
    ) -> float:
        """Calculate BM25 score for a term."""
        if doc_freq == 0:
            return 0.0
        
        # IDF component
        idf = math.log((total_docs - doc_freq + 0.5) / (doc_freq + 0.5))
        
        # TF component with length normalization
        tf_norm = (term_freq * (k1 + 1)) / (
            term_freq + k1 * (1 - b + b * (doc_length / avg_doc_length))
        )
        
        return idf * tf_norm
    
    @classmethod
    def score_document(
        cls,
        doc: Dict[str, Any],
        query_terms: List[str],
        field_matches: Dict[str, float],
        popularity_score: float
    ) -> float:
        """Calculate final relevance score for a document."""
        # Base score from field matches
        field_score = sum(
            cls.FIELD_WEIGHTS.get(field, 1.0) * score
            for field, score in field_matches.items()
        )
        
        # Section weight
        section_weight = cls.SECTION_WEIGHTS.get(str(doc.get("section", "")), 1.0)
        
        # Popularity boost (logarithmic)
        popularity_boost = 1.0 + math.log(1 + popularity_score) / 10
        
        # Length penalty for very long documents
        content_length = len(doc.get("content", ""))
        length_penalty = 1.0 if content_length < 10000 else 0.9
        
        # Calculate final score
        final_score = field_score * section_weight * popularity_boost * length_penalty
        
        return final_score


class OptimizedSearchEngine:
    """Optimized search engine with improved performance."""
    
    def __init__(self, db: Session):
        """Initialize the search engine."""
        self.db = db
        self.scorer = SearchScorer()
        self._init_search_metadata()
    
    def _init_search_metadata(self):
        """Initialize search metadata like document statistics."""
        # For now, disable FTS until tables are created
        self.has_fts = False
        
        # Original FTS detection (disabled for now)
        # try:
        #     # Check if FTS is available
        #     result = self.db.execute(text("SELECT sqlite_compileoption_used('ENABLE_FTS5')"))
        #     self.has_fts = bool(result.scalar())
        # except:
        #     self.has_fts = False
        
        # Cache document statistics
        self._update_doc_stats()
    
    @lru_cache(maxsize=1)
    def _update_doc_stats(self):
        """Update cached document statistics."""
        stats = self.db.execute(text("""
            SELECT 
                COUNT(*) as total_docs,
                AVG(LENGTH(COALESCE(raw_content, ''))) as avg_doc_length,
                MAX(access_count) as max_access_count
            FROM documents
        """)).first()
        
        self.total_docs = stats.total_docs or 0
        self.avg_doc_length = stats.avg_doc_length or 1000
        self.max_access_count = stats.max_access_count or 1
    
    def search(
        self,
        query: str,
        section: Optional[int] = None,
        limit: int = 20,
        offset: int = 0,
        search_sections: bool = True
    ) -> Dict[str, Any]:
        """
        Perform optimized search with relevance ranking.
        
        Args:
            query: Search query
            section: Optional section filter
            limit: Maximum results
            offset: Pagination offset
            search_sections: Whether to search within sections
            
        Returns:
            Search results with metadata
        """
        try:
            # Allow empty queries to browse all documents
            if not query:
                query = ""
            
            # Clean and parse query
            query_terms = self._parse_query(query) if query else []
            
            # Choose search method based on FTS availability
            if self.has_fts:
                results = self._fts_search(query, query_terms, section, limit, offset, search_sections)
            else:
                results = self._fallback_search(query, query_terms, section, limit, offset)
            
            # Update access counts for top results
            self._update_access_counts([r["id"] for r in results["results"][:5]])
            
            return results
            
        except SearchError:
            raise
        except Exception as e:
            logger.error(f"Search error: {e}")
            raise SearchError("Search failed", query)
    
    def _parse_query(self, query: str) -> List[str]:
        """Parse and clean search query."""
        # Remove special characters except quotes
        clean_query = re.sub(r'[^\w\s"-]', ' ', query.lower())
        
        # Extract phrases
        phrases = re.findall(r'"([^"]+)"', clean_query)
        
        # Remove phrases from query
        for phrase in phrases:
            clean_query = clean_query.replace(f'"{phrase}"', '')
        
        # Split into terms
        terms = [t.strip() for t in clean_query.split() if t.strip()]
        
        # Add phrases as single terms
        terms.extend(phrases)
        
        # Remove duplicates while preserving order
        seen = set()
        unique_terms = []
        for term in terms:
            if term not in seen and len(term) >= 2:
                seen.add(term)
                unique_terms.append(term)
        
        return unique_terms
    
    def _fts_search(
        self,
        query: str,
        query_terms: List[str],
        section: Optional[int],
        limit: int,
        offset: int,
        search_sections: bool
    ) -> Dict[str, Any]:
        """Perform FTS-based search."""
        
        # Build FTS query
        fts_query = self._build_fts_query(query_terms)
        
        # Main search query with scoring
        search_sql = """
        WITH search_results AS (
            SELECT DISTINCT
                d.id,
                d.name,
                d.title,
                d.summary,
                d.section,
                d.access_count,
                d.cache_status,
                -- Field matching scores
                CASE WHEN LOWER(d.name) = LOWER(:exact_query) THEN 1 ELSE 0 END as name_exact,
                CASE WHEN LOWER(d.name) LIKE LOWER(:prefix_pattern) THEN 1 ELSE 0 END as name_prefix,
                CASE WHEN LOWER(d.name) LIKE LOWER(:contains_pattern) THEN 1 ELSE 0 END as name_contains,
                CASE WHEN LOWER(d.title) = LOWER(:exact_query) THEN 1 ELSE 0 END as title_exact,
                CASE WHEN LOWER(d.title) LIKE LOWER(:contains_pattern) THEN 1 ELSE 0 END as title_contains,
                CASE WHEN LOWER(d.summary) LIKE LOWER(:contains_pattern) THEN 1 ELSE 0 END as summary_contains,
                -- FTS rank
                COALESCE(fts.rank, 0) as fts_rank,
                -- Highlighted snippets
                CASE WHEN fts.rowid IS NOT NULL THEN
                    snippet(fts_documents, 3, '<mark>', '</mark>', '...', 32)
                ELSE NULL END as snippet
            FROM documents d
            LEFT JOIN fts_documents fts ON d.id = fts.rowid AND fts_documents MATCH :fts_query
            WHERE 
                (:section IS NULL OR d.section = :section)
                AND (
                    fts.rowid IS NOT NULL
                    OR LOWER(d.name) LIKE LOWER(:contains_pattern)
                    OR LOWER(d.title) LIKE LOWER(:contains_pattern)
                    OR LOWER(d.summary) LIKE LOWER(:contains_pattern)
                )
        ),
        scored_results AS (
            SELECT 
                *,
                -- Calculate composite score
                (
                    name_exact * 10.0 +
                    name_prefix * 5.0 +
                    name_contains * 3.0 +
                    title_exact * 7.0 +
                    title_contains * 2.0 +
                    summary_contains * 1.5 +
                    ABS(fts_rank) * 2.0
                ) * (1.0 + LOG(1 + access_count) / 10.0) as relevance_score
            FROM search_results
        )
        SELECT * FROM scored_results
        ORDER BY relevance_score DESC, name ASC
        LIMIT :limit OFFSET :offset
        """
        
        # Count query
        count_sql = """
        SELECT COUNT(DISTINCT d.id) 
        FROM documents d
        LEFT JOIN fts_documents fts ON d.id = fts.rowid AND fts_documents MATCH :fts_query
        WHERE 
            (:section IS NULL OR d.section = :section)
            AND (
                fts.rowid IS NOT NULL
                OR LOWER(d.name) LIKE LOWER(:contains_pattern)
                OR LOWER(d.title) LIKE LOWER(:contains_pattern)
                OR LOWER(d.summary) LIKE LOWER(:contains_pattern)
            )
        """
        
        # Execute queries
        params = {
            "fts_query": fts_query,
            "exact_query": query,
            "prefix_pattern": f"{query}%",
            "contains_pattern": f"%{query}%",
            "section": section,
            "limit": limit,
            "offset": offset
        }
        
        results = self.db.execute(text(search_sql), params).fetchall()
        total = self.db.execute(text(count_sql), params).scalar() or 0
        
        # Format results
        formatted_results = []
        for row in results:
            result = {
                "id": row.id,
                "name": row.name,
                "title": row.title or row.name,
                "summary": row.summary or "",
                "section": row.section,
                "score": float(row.relevance_score),
                "snippet": row.snippet,
                "cache_status": row.cache_status,
                "matches": self._extract_matches(row, query_terms)
            }
            formatted_results.append(result)
        
        # Search within sections if enabled
        if search_sections and formatted_results:
            self._add_section_matches(formatted_results[:10], query_terms)
        
        return {
            "results": formatted_results,
            "total": total,
            "page": (offset // limit) + 1,
            "per_page": limit,
            "query": query,
            "terms": query_terms
        }
    
    def _fallback_search(
        self,
        query: str,
        query_terms: List[str],
        section: Optional[int],
        limit: int,
        offset: int
    ) -> Dict[str, Any]:
        """Fallback search without FTS using secure SQLAlchemy ORM."""
        from sqlalchemy import or_, func, and_
        from ..models.document import Document
        
        # Validate inputs
        limit = min(max(1, limit), 100)  # Enforce reasonable limits
        offset = max(0, offset)
        
        # Build query using SQLAlchemy ORM
        base_query = self.db.query(
            Document.id,
            Document.name,
            Document.title,
            Document.summary,
            Document.section,
            Document.access_count,
            Document.cache_status,
            func.length(Document.raw_content).label('content_length')
        )
        
        # Apply section filter if provided
        if section is not None:
            base_query = base_query.filter(Document.section == section)
        
        # Build search conditions safely using SQLAlchemy
        if query_terms:
            search_conditions = []
            for term in query_terms:
                # Sanitize term for LIKE pattern
                safe_term = term.replace('%', '\%').replace('_', '\_')
                pattern = f"%{safe_term}%"
                
                # Create OR condition for each field
                term_condition = or_(
                    func.lower(Document.name).like(func.lower(pattern)),
                    func.lower(Document.title).like(func.lower(pattern)),
                    func.lower(Document.summary).like(func.lower(pattern)),
                    func.lower(Document.raw_content).like(func.lower(pattern))
                )
                search_conditions.append(term_condition)
            
            # Combine all term conditions with OR
            base_query = base_query.filter(or_(*search_conditions))
        
        # Get total count before applying limit/offset
        total = base_query.count()
        
        # Apply ordering, limit and offset
        results = base_query.order_by(
            Document.access_count.desc(),
            Document.name.asc()
        ).limit(limit).offset(offset).all()
        
        # Format and score results
        formatted_results = []
        for row in results:
            # Calculate simple relevance score
            score = 1.0
            name_lower = row.name.lower()
            title_lower = (row.title or "").lower()
            
            for term in query_terms:
                if term in name_lower:
                    score += 3.0
                if term in title_lower:
                    score += 2.0
            
            # Popularity boost
            score *= (1.0 + math.log(1 + row.access_count) / 10.0)
            
            result = {
                "id": row.id,
                "name": row.name,
                "title": row.title or row.name,
                "summary": row.summary or "",
                "section": row.section,
                "score": score,
                "cache_status": row.cache_status,
                "matches": []
            }
            formatted_results.append(result)
        
        # Sort by score
        formatted_results.sort(key=lambda x: x["score"], reverse=True)
        
        return {
            "results": formatted_results,
            "total": total,
            "page": (offset // limit) + 1,
            "per_page": limit,
            "query": query,
            "terms": query_terms
        }
    
    def _build_fts_query(self, terms: List[str]) -> str:
        """Build optimized FTS query."""
        if not terms:
            return ""
        
        # For single term, use prefix search
        if len(terms) == 1:
            term = terms[0]
            return f'"{term}" OR {term}*'
        
        # For multiple terms, use combination
        parts = []
        
        # Add exact phrase for all terms
        parts.append(f'"{" ".join(terms)}"')
        
        # Add individual terms with prefix
        for term in terms:
            if len(term) > 2:
                parts.append(f'({term} OR {term}*)')
            else:
                parts.append(term)
        
        return " ".join(parts)
    
    def _extract_matches(self, row: Any, query_terms: List[str]) -> List[Dict[str, str]]:
        """Extract match information from search result."""
        matches = []
        
        # Check each field for matches
        for field in ["name", "title", "summary"]:
            value = getattr(row, field, None)
            if not value:
                continue
            
            value_lower = value.lower()
            for term in query_terms:
                if term in value_lower:
                    matches.append({
                        "field": field,
                        "value": value,
                        "term": term
                    })
                    break
        
        return matches
    
    def _add_section_matches(self, results: List[Dict], query_terms: List[str]):
        """Add section match information to results."""
        doc_ids = [r["id"] for r in results]
        
        if not doc_ids:
            return
        
        # Query sections for these documents using SQLAlchemy
        from ..models.document import Section
        
        sections = self.db.query(
            Section.document_id,
            Section.name.label('section_name'),
            Section.content
        ).filter(
            Section.document_id.in_(doc_ids)
        ).all()
        
        # Group sections by document
        doc_sections = defaultdict(list)
        for section in sections:
            content_lower = (section.content or "").lower()
            for term in query_terms:
                # Safely check for term in content
                safe_term = term.lower()
                if safe_term in content_lower:
                    doc_sections[section.document_id].append({
                        "section": section.section_name,
                        "term": term
                    })
                    break
        
        # Add section matches to results
        for result in results:
            if result["id"] in doc_sections:
                result["section_matches"] = doc_sections[result["id"]]
    
    def _update_access_counts(self, doc_ids: List[int]):
        """Update access counts for documents."""
        if not doc_ids:
            return
        
        try:
            from ..models.document import Document
            
            # Use SQLAlchemy ORM for safe updates
            self.db.query(Document).filter(
                Document.id.in_(doc_ids)
            ).update(
                {Document.access_count: Document.access_count + 1},
                synchronize_session=False
            )
            self.db.commit()
        except Exception as e:
            logger.warning(f"Failed to update access counts: {e}")
            self.db.rollback()
    
    def _empty_results(self, limit: int, offset: int) -> Dict[str, Any]:
        """Return empty search results."""
        return {
            "results": [],
            "total": 0,
            "page": (offset // limit) + 1,
            "per_page": limit,
            "query": "",
            "terms": []
        }