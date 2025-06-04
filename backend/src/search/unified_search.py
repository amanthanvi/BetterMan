"""
Unified search engine with multiple backends including AI-powered semantic search.
"""

import asyncio
import logging
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
import numpy as np
from sqlalchemy.orm import Session
from sqlalchemy import text, func, or_, and_
import json

from ..models.document import Document
from ..cache.cache_manager import CacheManager
from ..config_v2 import get_settings
from .search_engine import SearchEngine

logger = logging.getLogger(__name__)
settings = get_settings()


class SearchResult:
    """Enhanced search result with metadata."""
    
    def __init__(
        self,
        id: int,
        name: str,
        section: int,
        description: str,
        content: str,
        score: float,
        highlights: List[str] = None,
        metadata: Dict[str, Any] = None
    ):
        self.id = id
        self.name = name
        self.section = section
        self.description = description
        self.content = content
        self.score = score
        self.highlights = highlights or []
        self.metadata = metadata or {}


class SearchBackend:
    """Base class for search backends."""
    
    async def search(
        self,
        query: str,
        limit: int = 20,
        offset: int = 0,
        filters: Dict[str, Any] = None
    ) -> List[SearchResult]:
        """Perform search."""
        raise NotImplementedError
    
    async def get_status(self) -> Dict[str, Any]:
        """Get backend status."""
        raise NotImplementedError


class SQLiteFullTextSearchBackend(SearchBackend):
    """SQLite FTS5 search backend."""
    
    def __init__(self, db: Session):
        self.db = db
        self.available = self._check_fts_availability()
    
    def _check_fts_availability(self) -> bool:
        """Check if FTS5 is available."""
        try:
            result = self.db.execute(text("SELECT sqlite_compileoption_used('ENABLE_FTS5')"))
            return bool(result.scalar())
        except:
            return False
    
    async def search(
        self,
        query: str,
        limit: int = 20,
        offset: int = 0,
        filters: Dict[str, Any] = None
    ) -> List[SearchResult]:
        """Search using SQLite FTS5."""
        if not self.available:
            return []
        
        try:
            # Build FTS query
            fts_query = self._build_fts_query(query)
            
            # Base FTS search query
            sql = """
                SELECT 
                    d.id,
                    d.name,
                    d.section,
                    d.description,
                    d.content,
                    bm25(fts_documents) as score,
                    snippet(fts_documents, -1, '<mark>', '</mark>', '...', 32) as snippet
                FROM documents d
                JOIN fts_documents ON d.id = fts_documents.rowid
                WHERE fts_documents MATCH :query
            """
            
            # Add filters
            conditions = []
            params = {"query": fts_query}
            
            if filters:
                if "sections" in filters and filters["sections"]:
                    conditions.append("d.section IN :sections")
                    params["sections"] = tuple(filters["sections"])
                
                if "date_from" in filters and filters["date_from"]:
                    conditions.append("d.updated_at >= :date_from")
                    params["date_from"] = filters["date_from"]
                
                if "date_to" in filters and filters["date_to"]:
                    conditions.append("d.updated_at <= :date_to")
                    params["date_to"] = filters["date_to"]
            
            if conditions:
                sql += " AND " + " AND ".join(conditions)
            
            sql += " ORDER BY score DESC LIMIT :limit OFFSET :offset"
            params["limit"] = limit
            params["offset"] = offset
            
            # Execute search
            results = self.db.execute(text(sql), params).fetchall()
            
            # Convert to SearchResult objects
            search_results = []
            for row in results:
                highlights = self._extract_highlights(row.snippet) if row.snippet else []
                search_results.append(SearchResult(
                    id=row.id,
                    name=row.name,
                    section=row.section,
                    description=row.description,
                    content=row.content[:500],  # Truncate content
                    score=-row.score,  # BM25 returns negative scores
                    highlights=highlights
                ))
            
            return search_results
            
        except Exception as e:
            logger.error(f"FTS search error: {e}")
            return []
    
    def _build_fts_query(self, query: str) -> str:
        """Build FTS5 query string."""
        # Clean and prepare query
        query = query.strip()
        
        # Handle phrase searches
        if '"' in query:
            return query
        
        # Convert to prefix search for each term
        terms = query.split()
        fts_terms = []
        
        for term in terms:
            if len(term) >= 2:
                fts_terms.append(f"{term}*")
            else:
                fts_terms.append(term)
        
        return " ".join(fts_terms)
    
    def _extract_highlights(self, snippet: str) -> List[str]:
        """Extract highlighted portions from snippet."""
        import re
        highlights = re.findall(r'<mark>(.*?)</mark>', snippet)
        return highlights
    
    async def get_status(self) -> Dict[str, Any]:
        """Get FTS backend status."""
        return {
            "backend": "sqlite_fts5",
            "available": self.available,
            "version": "5.0"
        }


class PostgreSQLFullTextSearchBackend(SearchBackend):
    """PostgreSQL full-text search backend."""
    
    def __init__(self, db: Session):
        self.db = db
        self.available = self._check_pg_availability()
    
    def _check_pg_availability(self) -> bool:
        """Check if using PostgreSQL."""
        try:
            result = self.db.execute(text("SELECT version()"))
            return "PostgreSQL" in result.scalar()
        except:
            return False
    
    async def search(
        self,
        query: str,
        limit: int = 20,
        offset: int = 0,
        filters: Dict[str, Any] = None
    ) -> List[SearchResult]:
        """Search using PostgreSQL full-text search."""
        if not self.available:
            return []
        
        try:
            # Convert query to tsquery
            tsquery = self._build_tsquery(query)
            
            # Build search query
            sql = """
                SELECT 
                    d.id,
                    d.name,
                    d.section,
                    d.description,
                    d.content,
                    ts_rank_cd(d.search_vector, query) as rank,
                    ts_headline('english', d.content, query, 
                        'StartSel=<mark>, StopSel=</mark>, MaxWords=35, MinWords=15') as headline
                FROM documents d,
                     plainto_tsquery('english', :query) query
                WHERE d.search_vector @@ query
            """
            
            # Add filters
            conditions = []
            params = {"query": query}
            
            if filters:
                if "sections" in filters and filters["sections"]:
                    conditions.append("d.section = ANY(:sections)")
                    params["sections"] = filters["sections"]
            
            if conditions:
                sql += " AND " + " AND ".join(conditions)
            
            sql += " ORDER BY rank DESC LIMIT :limit OFFSET :offset"
            params["limit"] = limit
            params["offset"] = offset
            
            # Execute search
            results = self.db.execute(text(sql), params).fetchall()
            
            # Convert to SearchResult objects
            search_results = []
            for row in results:
                highlights = self._extract_highlights(row.headline) if row.headline else []
                search_results.append(SearchResult(
                    id=row.id,
                    name=row.name,
                    section=row.section,
                    description=row.description,
                    content=row.content[:500],
                    score=float(row.rank),
                    highlights=highlights
                ))
            
            return search_results
            
        except Exception as e:
            logger.error(f"PostgreSQL search error: {e}")
            return []
    
    def _build_tsquery(self, query: str) -> str:
        """Build PostgreSQL tsquery."""
        # Clean query
        query = query.strip()
        
        # Handle special operators
        if any(op in query for op in ['&', '|', '!', '<->']):
            return query
        
        # Convert to prefix search
        terms = query.split()
        return " & ".join(f"{term}:*" for term in terms if term)
    
    def _extract_highlights(self, headline: str) -> List[str]:
        """Extract highlights from headline."""
        import re
        highlights = re.findall(r'<mark>(.*?)</mark>', headline)
        return highlights
    
    async def get_status(self) -> Dict[str, Any]:
        """Get PostgreSQL search status."""
        return {
            "backend": "postgresql",
            "available": self.available,
            "extensions": ["pg_trgm", "unaccent"] if self.available else []
        }


class SemanticSearchBackend(SearchBackend):
    """AI-powered semantic search backend using embeddings."""
    
    def __init__(self, db: Session, cache_manager: CacheManager):
        self.db = db
        self.cache = cache_manager
        self.available = bool(settings.OPENAI_API_KEY and settings.AI_SEARCH_ENABLED)
        self.embedding_cache = {}
        self.client = None
        
        if self.available:
            self._initialize_client()
    
    def _initialize_client(self):
        """Initialize OpenAI client."""
        try:
            import openai
            self.client = openai.Client(api_key=settings.OPENAI_API_KEY.get_secret_value())
        except ImportError:
            logger.warning("OpenAI library not installed, semantic search disabled")
            self.available = False
        except Exception as e:
            logger.error(f"Failed to initialize OpenAI client: {e}")
            self.available = False
    
    async def search(
        self,
        query: str,
        limit: int = 20,
        offset: int = 0,
        filters: Dict[str, Any] = None
    ) -> List[SearchResult]:
        """Search using semantic similarity."""
        if not self.available or not self.client:
            return []
        
        try:
            # Get query embedding
            query_embedding = await self._get_embedding(query)
            if not query_embedding:
                return []
            
            # Get all documents (in production, use vector database)
            documents = self.db.query(Document)
            
            # Apply filters
            if filters:
                if "sections" in filters and filters["sections"]:
                    documents = documents.filter(Document.section.in_(filters["sections"]))
            
            documents = documents.all()
            
            # Calculate similarities
            similarities = []
            for doc in documents:
                # Get document embedding (cached)
                doc_embedding = await self._get_document_embedding(doc)
                if doc_embedding:
                    similarity = self._cosine_similarity(query_embedding, doc_embedding)
                    similarities.append((doc, similarity))
            
            # Sort by similarity
            similarities.sort(key=lambda x: x[1], reverse=True)
            
            # Apply pagination
            results = similarities[offset:offset + limit]
            
            # Convert to SearchResult objects
            search_results = []
            for doc, score in results:
                if score > 0.7:  # Similarity threshold
                    search_results.append(SearchResult(
                        id=doc.id,
                        name=doc.name,
                        section=doc.section,
                        description=doc.description,
                        content=doc.content[:500],
                        score=score,
                        highlights=[],
                        metadata={"similarity_type": "semantic"}
                    ))
            
            return search_results
            
        except Exception as e:
            logger.error(f"Semantic search error: {e}")
            return []
    
    async def _get_embedding(self, text: str) -> Optional[List[float]]:
        """Get embedding for text."""
        if not self.client:
            return None
        
        # Check cache
        cache_key = f"embedding:{hash(text)}"
        cached = await self.cache.get(cache_key)
        if cached:
            return cached
        
        try:
            response = await asyncio.to_thread(
                self.client.embeddings.create,
                input=text[:8000],  # Limit input length
                model=settings.EMBEDDING_MODEL
            )
            
            embedding = response.data[0].embedding
            
            # Cache embedding
            await self.cache.set(cache_key, embedding, expire=86400)  # 24 hours
            
            return embedding
            
        except Exception as e:
            logger.error(f"Error getting embedding: {e}")
            return None
    
    async def _get_document_embedding(self, doc: Document) -> Optional[List[float]]:
        """Get embedding for document."""
        # Check if already computed
        if doc.id in self.embedding_cache:
            return self.embedding_cache[doc.id]
        
        # Create document text for embedding
        doc_text = f"{doc.name} {doc.description} {doc.content[:1000]}"
        embedding = await self._get_embedding(doc_text)
        
        if embedding:
            self.embedding_cache[doc.id] = embedding
        
        return embedding
    
    def _cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """Calculate cosine similarity between two vectors."""
        vec1 = np.array(vec1)
        vec2 = np.array(vec2)
        
        dot_product = np.dot(vec1, vec2)
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)
        
        if norm1 == 0 or norm2 == 0:
            return 0.0
        
        return float(dot_product / (norm1 * norm2))
    
    async def get_status(self) -> Dict[str, Any]:
        """Get semantic search status."""
        return {
            "backend": "semantic",
            "available": self.available,
            "model": settings.EMBEDDING_MODEL if self.available else None
        }


class UnifiedSearchEngine:
    """Unified search engine that combines multiple backends."""
    
    def __init__(self, db: Session, cache_manager: CacheManager = None):
        self.db = db
        self.cache = cache_manager
        
        # Initialize backends
        self.backends = {
            "sqlite_fts": SQLiteFullTextSearchBackend(db),
            "postgresql": PostgreSQLFullTextSearchBackend(db),
            "semantic": SemanticSearchBackend(db, cache_manager) if cache_manager else None,
            "fallback": SearchEngine(db)  # Original search engine as fallback
        }
        
        # Determine primary backend
        self.primary_backend = self._select_primary_backend()
        
        logger.info(f"Unified search initialized with primary backend: {self.primary_backend}")
    
    def _select_primary_backend(self) -> str:
        """Select the best available backend."""
        if self.backends["postgresql"].available:
            return "postgresql"
        elif self.backends["sqlite_fts"].available:
            return "sqlite_fts"
        else:
            return "fallback"
    
    async def initialize(self):
        """Initialize search engine."""
        # Warm up semantic search if available
        if self.backends.get("semantic") and self.backends["semantic"].available:
            logger.info("Warming up semantic search backend...")
    
    async def search(
        self,
        query: str,
        sections: Optional[List[int]] = None,
        fuzzy: bool = True,
        use_semantic: bool = False,
        limit: int = 20,
        offset: int = 0,
        **kwargs
    ) -> List[SearchResult]:
        """
        Perform unified search across backends.
        
        Args:
            query: Search query
            sections: Filter by sections
            fuzzy: Enable fuzzy matching
            use_semantic: Enable semantic search (requires premium)
            limit: Maximum results
            offset: Pagination offset
        
        Returns:
            List of search results
        """
        # Build filters
        filters = {
            "sections": sections,
            "date_from": kwargs.get("date_from"),
            "date_to": kwargs.get("date_to"),
            "tags": kwargs.get("tags")
        }
        
        # Remove None values
        filters = {k: v for k, v in filters.items() if v is not None}
        
        # Try cache first
        if self.cache:
            cache_key = f"search:{hash(query)}:{sections}:{limit}:{offset}"
            cached = await self.cache.get(cache_key)
            if cached:
                return cached
        
        results = []
        
        # Primary search
        primary_backend = self.backends.get(self.primary_backend)
        if primary_backend:
            results = await primary_backend.search(query, limit, offset, filters)
        
        # Semantic search if enabled and available
        if use_semantic and self.backends.get("semantic") and self.backends["semantic"].available:
            semantic_results = await self.backends["semantic"].search(query, limit, offset, filters)
            
            # Merge results (deduplicate by ID)
            seen_ids = {r.id for r in results}
            for result in semantic_results:
                if result.id not in seen_ids:
                    results.append(result)
        
        # Fallback to basic search if no results
        if not results and self.primary_backend != "fallback":
            logger.info("No results from primary backend, falling back to basic search")
            fallback = self.backends["fallback"]
            if isinstance(fallback, SearchEngine):
                basic_results = fallback.search(query, section=sections[0] if sections else None)
                results = [
                    SearchResult(
                        id=r.id,
                        name=r.name,
                        section=r.section,
                        description=r.description or "",
                        content=r.content[:500] if hasattr(r, 'content') else "",
                        score=1.0,
                        highlights=[]
                    )
                    for r in basic_results[:limit]
                ]
        
        # Sort by score
        results.sort(key=lambda x: x.score, reverse=True)
        
        # Cache results
        if self.cache and results:
            await self.cache.set(cache_key, results, expire=300)  # 5 minutes
        
        return results
    
    async def find_similar(self, content: str, limit: int = 5) -> List[SearchResult]:
        """Find similar documents using semantic search."""
        if self.backends.get("semantic") and self.backends["semantic"].available:
            return await self.backends["semantic"].search(content, limit=limit)
        
        # Fallback to keyword extraction
        # Extract key terms from content
        import re
        words = re.findall(r'\b\w+\b', content.lower())
        word_freq = {}
        for word in words:
            if len(word) > 3:  # Skip short words
                word_freq[word] = word_freq.get(word, 0) + 1
        
        # Get top keywords
        keywords = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)[:5]
        query = " ".join([k[0] for k in keywords])
        
        return await self.search(query, limit=limit)
    
    async def get_section_facets(self, query: str) -> Dict[int, int]:
        """Get section facets for search query."""
        # Simple implementation - count documents per section
        facets = {}
        
        for section in range(1, 9):
            results = await self.search(query, sections=[section], limit=1)
            if results:
                count = len(results)  # In production, get actual count
                facets[section] = count
        
        return facets
    
    async def get_tag_facets(self, query: str) -> Dict[str, int]:
        """Get tag facets for search query."""
        # Placeholder implementation
        return {
            "system": 15,
            "network": 8,
            "files": 12,
            "process": 6
        }
    
    def get_backend_status(self) -> Dict[str, Dict[str, Any]]:
        """Get status of all search backends."""
        status = {}
        
        for name, backend in self.backends.items():
            if backend and hasattr(backend, 'get_status'):
                status[name] = asyncio.run(backend.get_status())
            else:
                status[name] = {"available": False}
        
        status["primary"] = self.primary_backend
        
        return status
    
    async def close(self):
        """Clean up resources."""
        # Close any open connections
        pass