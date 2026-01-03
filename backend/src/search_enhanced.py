# backend/src/search_enhanced.py
from typing import List, Dict, Any, Optional
import logging
import psycopg
from psycopg.rows import dict_row
from contextlib import contextmanager

logger = logging.getLogger(__name__)

@contextmanager
def _conn(dsn: str):
    with psycopg.connect(dsn, row_factory=dict_row) as conn:
        yield conn

def search(dsn: str, query: str, section: Optional[str] = None, limit: int = 25, fuzzy: bool = True) -> Dict[str, Any]:
    """
    Multi-stage search with proper ordering:
    1. Exact name match (score 1.0)
    2. Prefix match (score 0.9)
    3. Full-text search (weighted ts_rank)
    4. Trigram fuzzy match (similarity score)
    """
    q = query.strip()
    if not q:
        return {"query": q, "results": []}
    
    results: List[Dict[str, Any]] = []
    seen = set()

    try:
        with _conn(dsn) as conn, conn.cursor() as cur:
            # 1) Exact match
            params = [q]
            sql = """
                SELECT name, section, title, 
                       COALESCE(summary, LEFT(description, 200)) as summary,
                       'exact'::text AS source, 1.0 AS score 
                FROM man_pages 
                WHERE lower(name) = lower(%s)
            """
            if section:
                sql += " AND section = %s"
                params.append(section)
            sql += " ORDER BY section LIMIT %s"
            params.append(limit)
            
            cur.execute(sql, params)
            for r in cur.fetchall():
                key = (r["name"], r["section"])
                if key not in seen:
                    seen.add(key)
                    results.append(r)
            
            # 2) Prefix match
            if len(results) < limit:
                params = [q + "%", q]
                sql = """
                    SELECT name, section, title,
                           COALESCE(summary, LEFT(description, 200)) as summary,
                           'prefix'::text AS source, 0.9 AS score
                    FROM man_pages
                    WHERE lower(name) LIKE lower(%s) AND lower(name) != lower(%s)
                """
                if section:
                    sql += " AND section = %s"
                    params.append(section)
                sql += " ORDER BY name, section LIMIT %s"
                params.append(limit - len(results))
                
                cur.execute(sql, params)
                for r in cur.fetchall():
                    key = (r["name"], r["section"])
                    if key not in seen:
                        seen.add(key)
                        results.append(r)

            # 3) Full-text search (if search_vector exists)
            if len(results) < limit:
                try:
                    params = [q, q]
                    sql = """
                        SELECT name, section, title,
                               COALESCE(summary, LEFT(description, 200)) as summary,
                               'fts'::text AS source,
                               ts_rank_cd(search_vector, websearch_to_tsquery('english', %s)) AS score
                        FROM man_pages
                        WHERE search_vector @@ websearch_to_tsquery('english', %s)
                    """
                    if section:
                        sql += " AND section = %s"
                        params.append(section)
                    
                    # Exclude already found results
                    if results:
                        placeholders = ",".join(["%s"] * len(results))
                        existing_names = [r["name"] for r in results]
                        sql += f" AND name NOT IN ({placeholders})"
                        params.extend(existing_names)
                    
                    sql += " ORDER BY score DESC NULLS LAST, name LIMIT %s"
                    params.append(limit - len(results))
                    
                    cur.execute(sql, params)
                    for r in cur.fetchall():
                        key = (r["name"], r["section"])
                        if key not in seen:
                            seen.add(key)
                            results.append(r)
                except Exception as e:
                    logger.debug(f"FTS search failed (column may not exist): {e}")

            # 4) Trigram fuzzy search
            if fuzzy and len(results) < limit:
                try:
                    threshold = 0.15
                    # Use SET LOCAL (transaction-scoped) with literal value
                    cur.execute(f"SET LOCAL pg_trgm.similarity_threshold = {threshold}")
                    
                    params = [q, q, q, q]
                    sql = """
                        SELECT name, section, title,
                               COALESCE(summary, LEFT(description, 200)) as summary,
                               'trgm'::text AS source,
                               GREATEST(
                                   similarity(name, %s) * 0.8,
                                   similarity(title, %s) * 0.5,
                                   similarity(COALESCE(summary, ''), %s) * 0.3,
                                   similarity(COALESCE(title, ''), %s) * 0.3
                               ) AS score
                        FROM man_pages
                    """
                    
                    # Build WHERE clause
                    where_clauses = []
                    
                    # Exclude already found results
                    if results:
                        placeholders = ",".join(["%s"] * len(results))
                        existing_names = [r["name"] for r in results]
                        where_clauses.append(f"name NOT IN ({placeholders})")
                        params.extend(existing_names)
                    
                    if section:
                        where_clauses.append("section = %s")
                        params.append(section)
                    
                    # Add trigram matching condition
                    where_clauses.append("(name %% %s OR title %% %s)")
                    params.extend([q, q])
                    
                    if where_clauses:
                        sql += " WHERE " + " AND ".join(where_clauses)
                    
                    sql += " ORDER BY score DESC NULLS LAST, name LIMIT %s"
                    params.append(limit - len(results))
                    
                    cur.execute(sql, params)
                    for r in cur.fetchall():
                        key = (r["name"], r["section"])
                        if key not in seen:
                            seen.add(key)
                            results.append(r)
                except Exception as e:
                    logger.debug(f"Trigram search failed: {e}")

    except Exception as e:
        logger.error(f"Search error: {e}")
        return {"query": q, "results": [], "error": str(e)}

    # Format results
    formatted_results = [
        {
            "name": r["name"],
            "section": r["section"],
            "title": r["title"],
            "summary": r["summary"],
            "description": r["summary"],  # backward compatibility
            "source": r.get("source", "unknown"),
            "score": float(r.get("score", 0.0)),
            "category": "miscellaneous"  # Can be populated from DB if needed
        }
        for r in results
    ]
    
    # Already sorted by priority (exact > prefix > fts > trgm)
    # Within each category, sorted by score/name
    return {"query": q, "results": formatted_results[:limit]}

# Compatibility wrapper for existing code
def get_search(db_url: str):
    """Get a search instance for the given database URL."""
    return SearchEngine(db_url)

class SearchEngine:
    """Wrapper class for backward compatibility."""
    
    def __init__(self, db_url: str):
        self.db_url = db_url
    
    def search(self, query: str, section: Optional[str] = None, 
               limit: int = 25, fuzzy: bool = True, threshold: float = 0.3) -> Dict[str, Any]:
        """Search man pages with the given query."""
        return search(self.db_url, query, section, limit, fuzzy)