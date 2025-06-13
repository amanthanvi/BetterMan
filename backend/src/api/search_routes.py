# backend/src/api/search_routes.py
"""API routes for search functionality."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
import logging
import json

from ..db.session import get_db
from ..models.document import Document
from ..search.optimized_search import OptimizedSearchEngine
from ..search.instant_search import InstantSearchEngine
from ..search.fuzzy_search import FuzzySearchEngine
from ..cache.cache_manager import CacheManager
from ..errors import SearchError, ValidationError
from ..config import get_settings
from ..auth.dependencies import SuperUser, get_current_user_optional

logger = logging.getLogger(__name__)
settings = get_settings()

# Create router
router = APIRouter()


def get_search_engine(db: Session = Depends(get_db)) -> OptimizedSearchEngine:
    """Dependency to get an OptimizedSearchEngine instance."""
    return OptimizedSearchEngine(db)


def get_fuzzy_search_engine(db: Session = Depends(get_db)) -> FuzzySearchEngine:
    """Dependency to get a FuzzySearchEngine instance."""
    return FuzzySearchEngine(db)


def get_instant_search_engine(db: Session = Depends(get_db)) -> InstantSearchEngine:
    """Dependency to get an InstantSearchEngine instance."""
    from ..parser.groff_parser import GroffParser
    cache_manager = CacheManager(db, GroffParser())
    return InstantSearchEngine(db, cache_manager)


@router.get("", response_model=Dict[str, Any])
@router.get("/", response_model=Dict[str, Any])
async def search_documents(
    request: Request,
    q: str = Query("", description="Search query"),
    section: Optional[int] = Query(None, ge=1, le=8, description="Filter by section number"),
    limit: int = Query(20, ge=1, le=100, description="Maximum results"),
    offset: int = Query(0, ge=0, description="Result offset"),
    search_engine: OptimizedSearchEngine = Depends(get_search_engine),
    db: Session = Depends(get_db),
):
    """
    Search documentation with optimized relevance ranking.
    
    Features:
    - Full-text search with FTS5 (if available)
    - BM25 relevance ranking
    - Phrase search support (use quotes)
    - Section filtering
    - Result highlighting
    - Popularity-based boosting
    """
    try:
        request_id = getattr(request.state, "request_id", "unknown")
        logger.info(
            f"Search request",
            extra={
                "request_id": request_id,
                "query": q,
                "section": section,
                "limit": limit,
                "offset": offset
            }
        )
        
        # Handle empty query - return filtered documents
        if not q or not q.strip():
            # Build query for all documents with optional section filter
            query = db.query(Document)
            
            if section:
                query = query.filter(Document.section == str(section))
            
            # Get total count
            total = query.count()
            
            # Apply pagination and ordering
            documents = query.order_by(
                Document.priority.asc().nullsfirst(),
                Document.name.asc()
            ).offset(offset).limit(limit).all()
            
            # Format results similar to search results
            results = {
                "query": "",
                "results": [
                    {
                        "id": doc.id,
                        "name": doc.name,
                        "title": doc.title or doc.name,
                        "section": doc.section,
                        "summary": doc.summary or "",
                        "category": doc.category,
                        "score": 1.0,  # Default score for browse mode
                        "matches": []
                    }
                    for doc in documents
                ],
                "total": total,
                "took": 0,
                "page": (offset // limit) + 1,
                "per_page": limit
            }
        else:
            # Perform normal search
            results = search_engine.search(
                query=q,
                section=section,
                limit=limit,
                offset=offset,
                search_sections=True
            )
        
        logger.info(
            f"Search completed",
            extra={
                "request_id": request_id,
                "query": q,
                "total_results": results.get("total", 0)
            }
        )
        
        return results
        
    except SearchError as e:
        raise
    except Exception as e:
        logger.error(f"Unexpected search error: {e}")
        raise SearchError("Search failed", q)


@router.get("/search", response_model=Dict[str, Any])
async def search_documents_legacy(
    request: Request,
    q: str = Query(..., min_length=2, description="Search query"),
    section: Optional[int] = Query(None, description="Filter by section number"),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=100, description="Results per page"),
    search_engine: OptimizedSearchEngine = Depends(get_search_engine),
    db: Session = Depends(get_db),
):
    """Legacy search endpoint for backward compatibility."""
    offset = (page - 1) * per_page
    return await search_documents(
        request=request,
        q=q,
        section=section,
        limit=per_page,
        offset=offset,
        search_engine=search_engine,
        db=db
    )


@router.get("/suggest", response_model=Dict[str, Any])
async def suggest_search(
    request: Request,
    q: str = Query(..., min_length=2, description="Search query for suggestions"),
    limit: int = Query(10, ge=1, le=20, description="Maximum suggestions"),
    db: Session = Depends(get_db),
):
    """
    Get search suggestions based on query prefix.
    
    Returns:
    - suggestions: List of suggested search terms
    """
    try:
        request_id = getattr(request.state, "request_id", "unknown")
        logger.info(
            f"Suggest request",
            extra={
                "request_id": request_id,
                "query": q,
                "limit": limit
            }
        )
        
        # For now, return simple command suggestions based on prefix
        # In a real implementation, this would use a trie or similar data structure
        popular_commands = [
            "ls", "cd", "grep", "find", "cat", "vim", "git", "ssh", "tar", "curl",
            "chmod", "chown", "cp", "mv", "rm", "mkdir", "rmdir", "touch", "echo",
            "sed", "awk", "sort", "uniq", "cut", "paste", "join", "split", "head",
            "tail", "less", "more", "man", "info", "which", "whereis", "locate",
            "ps", "top", "kill", "killall", "jobs", "fg", "bg", "nohup", "screen",
            "tmux", "docker", "systemctl", "service", "apt", "yum", "brew", "npm",
            "pip", "composer", "gem", "cargo", "go", "make", "gcc", "g++", "python",
            "node", "ruby", "perl", "bash", "sh", "zsh", "fish", "export", "alias",
            "source", "history", "clear", "exit", "logout", "reboot", "shutdown",
            "mount", "umount", "df", "du", "free", "uptime", "date", "cal", "who",
            "whoami", "id", "groups", "passwd", "su", "sudo", "useradd", "usermod",
            "userdel", "groupadd", "groupmod", "groupdel", "cron", "crontab", "at"
        ]
        
        # Filter commands that start with the query
        suggestions = [
            cmd for cmd in popular_commands 
            if cmd.lower().startswith(q.lower())
        ][:limit]
        
        # Also search in document titles
        doc_suggestions = db.query(Document.name).filter(
            Document.name.ilike(f"{q}%")
        ).distinct().limit(limit - len(suggestions)).all()
        
        # Combine and deduplicate
        all_suggestions = list(set(suggestions + [doc.name for doc in doc_suggestions]))[:limit]
        
        logger.info(
            f"Suggest completed",
            extra={
                "request_id": request_id,
                "query": q,
                "suggestion_count": len(all_suggestions)
            }
        )
        
        return {
            "suggestions": all_suggestions,
            "query": q
        }
        
    except Exception as e:
        logger.error(f"Suggest error: {e}")
        return {
            "suggestions": [],
            "query": q,
            "error": str(e)
        }


@router.get("/instant", response_model=Dict[str, Any])
async def instant_search(
    request: Request,
    q: str = Query("", description="Search query"),
    limit: int = Query(10, ge=1, le=50, description="Maximum results"),
    instant_engine: InstantSearchEngine = Depends(get_instant_search_engine),
    current_user = Depends(get_current_user_optional),
):
    """
    Instant search with autocomplete, fuzzy matching, and natural language support.
    
    Features:
    - Fuzzy matching for typo tolerance
    - Natural language query understanding
    - Command shortcuts (use ! prefix)
    - Smart suggestions and "Did you mean?"
    - Category-based recommendations
    - User search history (if authenticated)
    """
    try:
        request_id = getattr(request.state, "request_id", "unknown")
        user_id = current_user.id if current_user else None
        
        logger.info(
            f"Instant search request",
            extra={
                "request_id": request_id,
                "query": q,
                "limit": limit,
                "user_id": user_id
            }
        )
        
        # Perform instant search
        results = await instant_engine.instant_search(
            query=q,
            user_id=user_id,
            limit=limit
        )
        
        # Track search if query is not empty
        if q:
            await instant_engine.track_search(
                query=q,
                results_count=len(results.get("results", [])),
                user_id=user_id
            )
        
        return results
        
    except Exception as e:
        logger.error(f"Instant search error: {e}")
        raise SearchError("Instant search failed", q)


@router.get("/autocomplete", response_model=List[Dict[str, Any]])
async def autocomplete(
    request: Request,
    prefix: str = Query(..., min_length=1, description="Search prefix"),
    limit: int = Query(10, ge=1, le=20, description="Maximum suggestions"),
    context: Optional[str] = Query(None, description="JSON context object"),
    fuzzy_engine: FuzzySearchEngine = Depends(get_fuzzy_search_engine),
):
    """
    Get autocomplete suggestions for search prefix.
    
    Returns suggestions with types:
    - command: Direct command match
    - abbreviation: Expanded abbreviation
    - correction: Typo correction
    - fuzzy: Fuzzy match
    
    Optional context can include:
    - recent_commands: List of recently viewed commands
    - current_command: Currently viewing command
    """
    try:
        request_id = getattr(request.state, "request_id", "unknown")
        logger.info(
            f"Autocomplete request",
            extra={
                "request_id": request_id,
                "prefix": prefix,
                "limit": limit
            }
        )
        
        # Parse context if provided
        parsed_context = None
        if context:
            try:
                parsed_context = json.loads(context)
            except:
                pass
        
        # Get autocomplete suggestions
        suggestions = fuzzy_engine.autocomplete(prefix, limit=limit)
        
        # If context provided, use instant search engine for smarter suggestions
        if parsed_context:
            instant_engine = get_instant_search_engine(fuzzy_engine.db)
            suggestions = await instant_engine.get_search_suggestions(
                prefix=prefix,
                context=parsed_context
            )
        
        return suggestions
        
    except Exception as e:
        logger.error(f"Autocomplete error: {e}")
        return []


@router.get("/fuzzy", response_model=Dict[str, Any])
async def fuzzy_search(
    request: Request,
    q: str = Query(..., min_length=1, description="Search query"),
    section: Optional[int] = Query(None, ge=1, le=8, description="Filter by section"),
    limit: int = Query(20, ge=1, le=100, description="Maximum results"),
    offset: int = Query(0, ge=0, description="Result offset"),
    threshold: float = Query(0.7, ge=0.0, le=1.0, description="Fuzzy match threshold"),
    fuzzy_engine: FuzzySearchEngine = Depends(get_fuzzy_search_engine),
):
    """
    Fuzzy search with typo tolerance and similarity matching.
    
    Features:
    - Levenshtein distance for typo tolerance
    - Common typo corrections
    - Abbreviation expansion
    - Similarity scoring
    - "Did you mean?" suggestions
    """
    try:
        request_id = getattr(request.state, "request_id", "unknown")
        logger.info(
            f"Fuzzy search request",
            extra={
                "request_id": request_id,
                "query": q,
                "section": section,
                "threshold": threshold
            }
        )
        
        # Perform fuzzy search
        results = fuzzy_engine.search_with_fuzzy(
            query=q,
            section=section,
            limit=limit,
            offset=offset,
            fuzzy_threshold=threshold
        )
        
        return results
        
    except Exception as e:
        logger.error(f"Fuzzy search error: {e}")
        raise SearchError("Fuzzy search failed", q)


@router.post("/reindex")
async def reindex_documents(
    request: Request,
    db: Session = Depends(get_db),
    current_user: SuperUser = None,  # Require superuser for reindexing
):
    """
    Trigger reindexing of all documents.
    
    This endpoint rebuilds the FTS index from scratch.
    Should be called after bulk imports or schema changes.
    """
    try:
        request_id = getattr(request.state, "request_id", "unknown")
        logger.info(f"Reindex request", extra={"request_id": request_id})
        
        # For now, we'll use the original search engine for reindexing
        # since it has the index management methods
        from ..search.search_engine import SearchEngine
        search_engine = SearchEngine(db)
        
        # Reindex all documents
        indexed_count = search_engine.reindex_all_documents()
        
        # Clear search cache after reindexing
        optimized_engine = get_search_engine(db)
        optimized_engine.invalidate_cache()
        
        logger.info(
            f"Reindex completed",
            extra={
                "request_id": request_id,
                "indexed_count": indexed_count
            }
        )
        
        return {
            "message": f"Successfully reindexed {indexed_count} documents",
            "indexed_count": indexed_count,
            "status": "success"
        }
        
    except Exception as e:
        logger.error(f"Reindex error: {e}")
        raise SearchError(f"Reindex failed: {str(e)}")


@router.get("/cache/stats", response_model=Dict[str, Any])
async def get_cache_statistics(
    request: Request,
    search_engine: OptimizedSearchEngine = Depends(get_search_engine),
):
    """
    Get search cache statistics.
    
    Returns information about cache performance including:
    - Hit rate
    - Cache size
    - Memory usage
    - Redis connection status
    """
    try:
        request_id = getattr(request.state, "request_id", "unknown")
        logger.info(f"Cache stats request", extra={"request_id": request_id})
        
        stats = search_engine.get_cache_stats()
        
        return {
            "cache_stats": stats,
            "status": "success"
        }
        
    except Exception as e:
        logger.error(f"Cache stats error: {e}")
        return {
            "cache_stats": {},
            "status": "error",
            "message": str(e)
        }


@router.post("/cache/clear")
async def clear_search_cache(
    request: Request,
    pattern: Optional[str] = Query(None, description="Optional pattern to match for selective clearing"),
    search_engine: OptimizedSearchEngine = Depends(get_search_engine),
    current_user: SuperUser = None,  # Require superuser
):
    """
    Clear search cache entries.
    
    Args:
        pattern: Optional pattern to match. If not provided, clears all cache.
    """
    try:
        request_id = getattr(request.state, "request_id", "unknown")
        logger.info(
            f"Cache clear request",
            extra={
                "request_id": request_id,
                "pattern": pattern
            }
        )
        
        search_engine.invalidate_cache(pattern)
        
        return {
            "message": f"Successfully cleared cache{' matching pattern: ' + pattern if pattern else ''}",
            "status": "success"
        }
        
    except Exception as e:
        logger.error(f"Cache clear error: {e}")
        raise SearchError(f"Cache clear failed: {str(e)}")
