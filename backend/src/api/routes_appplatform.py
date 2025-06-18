"""
API routes for DigitalOcean App Platform deployment
"""
from fastapi import APIRouter, Query, HTTPException, Request, Depends
from typing import Optional, List
import logging
import os

# Use App Platform database module
from ..database_appplatform import (
    search_man_pages,
    get_man_page,
    get_common_commands,
    get_categories,
    get_man_pages_by_category,
    log_search,
    get_search_analytics,
    get_database_stats,
    ensure_database_exists
)

logger = logging.getLogger(__name__)
router = APIRouter()

# Initialize database on startup
ensure_database_exists()

@router.get("/search")
async def search(
    q: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(20, ge=1, le=100, description="Maximum results"),
    request: Request = None
):
    """Search man pages"""
    try:
        results = search_man_pages(q, limit)
        
        # Log search (async would be better)
        user_ip = request.client.host if request else None
        user_agent = request.headers.get("user-agent") if request else None
        log_search(q, len(results), user_ip=user_ip, user_agent=user_agent)
        
        return {
            "query": q,
            "count": len(results),
            "results": results
        }
    except Exception as e:
        logger.error(f"Search error: {e}")
        raise HTTPException(status_code=500, detail="Search failed")

@router.get("/documents/{name}")
async def get_document(
    name: str,
    section: Optional[int] = Query(None, description="Manual section")
):
    """Get a specific man page"""
    try:
        page = get_man_page(name, section)
        if not page:
            raise HTTPException(status_code=404, detail="Man page not found")
        return page
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Document retrieval error: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve document")

@router.get("/categories")
async def list_categories():
    """List all categories with counts"""
    try:
        return get_categories()
    except Exception as e:
        logger.error(f"Categories error: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve categories")

@router.get("/categories/{category}")
async def get_category(
    category: str,
    limit: int = Query(50, ge=1, le=200)
):
    """Get man pages in a category"""
    try:
        pages = get_man_pages_by_category(category, limit)
        return {
            "category": category,
            "count": len(pages),
            "pages": pages
        }
    except Exception as e:
        logger.error(f"Category pages error: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve category pages")

@router.get("/common")
async def get_common(limit: int = Query(20, ge=1, le=100)):
    """Get common commands"""
    try:
        return get_common_commands(limit)
    except Exception as e:
        logger.error(f"Common commands error: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve common commands")

@router.get("/analytics")
async def get_analytics(days: int = Query(7, ge=1, le=30)):
    """Get search analytics"""
    try:
        return get_search_analytics(days)
    except Exception as e:
        logger.error(f"Analytics error: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve analytics")

@router.get("/stats")
async def get_stats():
    """Get database statistics"""
    try:
        return get_database_stats()
    except Exception as e:
        logger.error(f"Stats error: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve stats")

@router.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        # Quick database check
        stats = get_database_stats()
        return {
            "status": "healthy",
            "database": "connected",
            "total_pages": stats["total_pages"]
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "status": "unhealthy",
            "database": "error",
            "error": str(e)
        }