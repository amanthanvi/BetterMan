"""Enhanced search with fuzzy matching for BetterMan API."""

import os
import psycopg
from typing import List, Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)

class EnhancedSearch:
    """Enhanced search with PostgreSQL pg_trgm fuzzy matching."""
    
    def __init__(self, db_url: str):
        self.db_url = db_url
        self._ensure_extensions()
    
    def _ensure_extensions(self):
        """Ensure required PostgreSQL extensions are installed."""
        try:
            with psycopg.connect(self.db_url) as conn:
                with conn.cursor() as cur:
                    # Enable pg_trgm for fuzzy search
                    cur.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm;")
                    # Enable unaccent for better matching
                    cur.execute("CREATE EXTENSION IF NOT EXISTS unaccent;")
                    conn.commit()
                    logger.info("PostgreSQL extensions enabled")
        except Exception as e:
            logger.warning(f"Could not enable extensions: {e}")
    
    def search(
        self, 
        query: str, 
        limit: int = 20,
        section: Optional[str] = None,
        fuzzy: bool = True,
        threshold: float = 0.2  # Lowered from 0.3 for better fuzzy matching
    ) -> Dict[str, Any]:
        """
        Search man pages with fuzzy matching support.
        
        Args:
            query: Search query string
            limit: Maximum number of results
            section: Optional section filter
            fuzzy: Enable fuzzy matching
            threshold: Similarity threshold (0-1)
        """
        if not query:
            return self._get_common_commands(limit)
        
        try:
            with psycopg.connect(self.db_url) as conn:
                with conn.cursor() as cur:
                    results = []
                    
                    # First try exact match
                    exact_query = """
                        SELECT name, section, title, description, category,
                               1.0 as score
                        FROM man_pages
                        WHERE LOWER(name) = LOWER(%s)
                    """
                    params = [query]
                    
                    if section:
                        exact_query += " AND section = %s"
                        params.append(section)
                    
                    exact_query += " LIMIT %s"
                    params.append(limit)
                    
                    cur.execute(exact_query, params)
                    exact_results = cur.fetchall()
                    results.extend(exact_results)
                    
                    # If we need more results and fuzzy is enabled
                    if len(results) < limit and fuzzy:
                        # Set similarity threshold
                        cur.execute("SET pg_trgm.similarity_threshold = %s", (threshold,))
                        
                        # Fuzzy search with weighted similarity scoring
                        fuzzy_query = """
                            SELECT DISTINCT ON (name, section)
                                   name, section, title, description, category,
                                   GREATEST(
                                       similarity(name, %s) * 1.0,  -- Highest weight for name match
                                       similarity(title, %s) * 0.6,  -- Medium weight for title
                                       similarity(COALESCE(description, ''), %s) * 0.3  -- Lower weight for description
                                   ) as score
                            FROM man_pages
                            WHERE (
                                name %% %s OR 
                                title %% %s OR 
                                COALESCE(description, '') %% %s
                            )
                        """
                        params = [query] * 6
                        
                        if section:
                            fuzzy_query += " AND section = %s"
                            params.append(section)
                        
                        # Exclude exact matches already found
                        if exact_results:
                            exact_names = [r[0] for r in exact_results]
                            placeholders = ','.join(['%s'] * len(exact_names))
                            fuzzy_query += f" AND name NOT IN ({placeholders})"
                            params.extend(exact_names)
                        
                        fuzzy_query += """
                            ORDER BY name, section, score DESC
                            LIMIT %s
                        """
                        params.append(limit - len(results))
                        
                        cur.execute(fuzzy_query, params)
                        fuzzy_results = cur.fetchall()
                        results.extend(fuzzy_results)
                    
                    # Format results
                    formatted_results = []
                    for r in results:
                        formatted_results.append({
                            "name": r[0],
                            "section": r[1],
                            "title": r[2],
                            "description": r[3][:200] if r[3] else None,
                            "category": r[4],
                            "score": float(r[5]) if len(r) > 5 else 1.0,
                            "snippet": self._generate_snippet(r[3], query) if r[3] else None
                        })
                    
                    # Sort by score
                    formatted_results.sort(key=lambda x: x['score'], reverse=True)
                    
                    return {
                        "query": query,
                        "results": formatted_results,
                        "total": len(formatted_results),
                        "fuzzy": fuzzy
                    }
                    
        except Exception as e:
            logger.error(f"Search error: {e}")
            # Fallback to simple search
            return self._simple_search(query, limit, section)
    
    def _simple_search(
        self, 
        query: str, 
        limit: int = 20,
        section: Optional[str] = None
    ) -> Dict[str, Any]:
        """Fallback simple search without fuzzy matching."""
        try:
            with psycopg.connect(self.db_url) as conn:
                with conn.cursor() as cur:
                    sql = """
                        SELECT name, section, title, description, category
                        FROM man_pages 
                        WHERE name ILIKE %s OR title ILIKE %s OR description ILIKE %s
                    """
                    params = [f"%{query}%", f"%{query}%", f"%{query}%"]
                    
                    if section:
                        sql += " AND section = %s"
                        params.append(section)
                    
                    sql += " LIMIT %s"
                    params.append(limit)
                    
                    cur.execute(sql, params)
                    results = cur.fetchall()
                    
                    return {
                        "query": query,
                        "results": [
                            {
                                "name": r[0],
                                "section": r[1],
                                "title": r[2],
                                "description": r[3][:200] if r[3] else None,
                                "category": r[4],
                                "score": 0.5
                            }
                            for r in results
                        ],
                        "total": len(results),
                        "fuzzy": False
                    }
        except Exception as e:
            logger.error(f"Simple search error: {e}")
            return {"query": query, "results": [], "total": 0, "error": str(e)}
    
    def _get_common_commands(self, limit: int = 20) -> Dict[str, Any]:
        """Get common commands when no query is provided."""
        try:
            with psycopg.connect(self.db_url) as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT name, section, title, description, category
                        FROM man_pages 
                        WHERE is_common = true OR name IN (
                            'ls', 'cd', 'grep', 'find', 'cat', 'echo', 'chmod',
                            'mkdir', 'rm', 'cp', 'mv', 'ssh', 'git', 'docker',
                            'curl', 'vim', 'ps', 'kill', 'tar', 'sed', 'awk'
                        )
                        ORDER BY 
                            CASE WHEN is_common = true THEN 0 ELSE 1 END,
                            name
                        LIMIT %s
                    """, (limit,))
                    
                    results = cur.fetchall()
                    
                    return {
                        "query": "",
                        "results": [
                            {
                                "name": r[0],
                                "section": r[1],
                                "title": r[2],
                                "description": r[3][:200] if r[3] else None,
                                "category": r[4],
                                "score": 1.0,
                                "isCommon": True
                            }
                            for r in results
                        ],
                        "total": len(results)
                    }
        except Exception as e:
            logger.error(f"Error getting common commands: {e}")
            return {"query": "", "results": [], "total": 0, "error": str(e)}
    
    def _generate_snippet(self, text: str, query: str, context_length: int = 150) -> str:
        """Generate a snippet with query context."""
        if not text:
            return ""
        
        # Find query position in text (case insensitive)
        lower_text = text.lower()
        lower_query = query.lower()
        pos = lower_text.find(lower_query)
        
        if pos == -1:
            # Query not found, return beginning of text
            return text[:context_length] + ("..." if len(text) > context_length else "")
        
        # Calculate snippet boundaries
        start = max(0, pos - context_length // 2)
        end = min(len(text), pos + len(query) + context_length // 2)
        
        snippet = text[start:end]
        
        # Add ellipsis if needed
        if start > 0:
            snippet = "..." + snippet
        if end < len(text):
            snippet = snippet + "..."
        
        return snippet

# Global search instance
_search_instance = None

def get_search() -> EnhancedSearch:
    """Get or create the global search instance."""
    global _search_instance
    if _search_instance is None:
        db_url = os.environ.get('DATABASE_URL', '')
        _search_instance = EnhancedSearch(db_url)
    return _search_instance