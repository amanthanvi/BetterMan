"""
API routes using SQLite backend
"""
from fastapi import APIRouter, HTTPException, Query, Request
from typing import Optional, List
import logging

from ..database_sqlite import (
    search_man_pages,
    get_man_page,
    get_common_commands,
    get_categories,
    get_man_pages_by_category,
    log_search,
    get_search_analytics,
    get_database_stats
)

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        stats = get_database_stats()
        return {
            "status": "healthy",
            "database": "sqlite",
            "total_pages": stats['total_pages']
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {"status": "unhealthy", "error": str(e)}

@router.get("/api/search")
async def search(
    q: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(20, ge=1, le=100, description="Maximum results"),
    request: Request = None
):
    """Search man pages"""
    try:
        results = search_man_pages(q, limit)
        
        # Log search
        user_ip = request.client.host if request else None
        user_agent = request.headers.get('user-agent') if request else None
        log_search(q, len(results), user_ip=user_ip, user_agent=user_agent)
        
        return {
            "query": q,
            "count": len(results),
            "results": results
        }
    except Exception as e:
        logger.error(f"Search error: {e}")
        raise HTTPException(status_code=500, detail="Search failed")

@router.get("/api/man/{name}")
async def get_man_page_endpoint(
    name: str,
    section: Optional[int] = Query(None, ge=1, le=9)
):
    """Get a specific man page"""
    page = get_man_page(name, section)
    
    if not page:
        raise HTTPException(status_code=404, detail=f"Man page '{name}' not found")
    
    return page

@router.get("/api/man/{name}/{section}")
async def get_man_page_by_section(name: str, section: int):
    """Get a specific man page by section"""
    page = get_man_page(name, section)
    
    if not page:
        raise HTTPException(
            status_code=404,
            detail=f"Man page '{name}' in section {section} not found"
        )
    
    return page

@router.get("/api/common")
async def get_common():
    """Get common commands"""
    return {
        "commands": get_common_commands()
    }

@router.get("/api/categories")
async def get_categories_endpoint():
    """Get all categories"""
    return {
        "categories": get_categories()
    }

@router.get("/api/category/{category}")
async def get_category_pages(
    category: str,
    limit: int = Query(50, ge=1, le=200)
):
    """Get man pages in a category"""
    pages = get_man_pages_by_category(category, limit)
    
    return {
        "category": category,
        "count": len(pages),
        "pages": pages
    }

@router.get("/api/stats")
async def get_stats():
    """Get database statistics"""
    return get_database_stats()

@router.get("/api/analytics")
async def get_analytics(
    days: int = Query(7, ge=1, le=30, description="Days to analyze")
):
    """Get search analytics"""
    return get_search_analytics(days)

@router.post("/api/track/click")
async def track_click(
    query: str,
    result: str,
    request: Request = None
):
    """Track search result clicks"""
    try:
        user_ip = request.client.host if request else None
        user_agent = request.headers.get('user-agent') if request else None
        
        # Update the search log with clicked result
        log_search(query, 0, clicked_result=result, user_ip=user_ip, user_agent=user_agent)
        
        return {"status": "tracked"}
    except Exception as e:
        logger.error(f"Click tracking error: {e}")
        return {"status": "error"}