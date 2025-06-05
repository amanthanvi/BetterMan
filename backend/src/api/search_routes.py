# backend/src/api/search_routes.py
"""API routes for search functionality."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
import logging

from ..db.session import get_db
from ..models.document import Document
from ..search.optimized_search import OptimizedSearchEngine
from ..errors import SearchError, ValidationError
from ..config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Create router
router = APIRouter()


def get_search_engine(db: Session = Depends(get_db)) -> OptimizedSearchEngine:
    """Dependency to get an OptimizedSearchEngine instance."""
    return OptimizedSearchEngine(db)


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
):
    """Legacy search endpoint for backward compatibility."""
    offset = (page - 1) * per_page
    return await search_documents(
        request=request,
        q=q,
        section=section,
        limit=per_page,
        offset=offset,
        search_engine=search_engine
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


@router.post("/reindex")
async def reindex_documents(
    request: Request,
    db: Session = Depends(get_db),
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
