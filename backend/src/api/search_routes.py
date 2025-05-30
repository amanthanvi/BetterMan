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
    q: str = Query(..., min_length=2, description="Search query"),
    section: Optional[int] = Query(None, ge=1, le=8, description="Filter by section number"),
    limit: int = Query(20, ge=1, le=100, description="Maximum results"),
    offset: int = Query(0, ge=0, description="Result offset"),
    search_engine: OptimizedSearchEngine = Depends(get_search_engine),
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
        
        # Perform search
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
