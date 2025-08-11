"""
API routes for man pages using the PostgreSQL man_pages table.
Implements all required endpoints with Redis caching and proper error handling.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Path, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text, func, and_, or_
from typing import List, Optional, Dict, Any
import logging
from datetime import datetime, timedelta
import json

from ..db.postgres_connection import get_db
from ..models.man_page import (
    ManPage,
    ManPageDetail,
    ManPageSummary,
    SearchResult,
    CategoryInfo,
    PopularCommand
)
from ..cache.cache_manager import get_cache_manager
from ..errors import NotFoundError, DatabaseError
from ..config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Create router with prefix
router = APIRouter(prefix="/man", tags=["man-pages"])


@router.get("/search", response_model=Dict[str, Any])
async def search_man_pages(
    request: Request,
    q: str = Query(..., min_length=1, max_length=100, description="Search query"),
    limit: int = Query(20, ge=1, le=100, description="Results per page"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    category: Optional[str] = Query(None, description="Filter by category"),
    section: Optional[str] = Query(None, description="Filter by section"),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Full-text search across man pages using PostgreSQL FTS.
    
    Features:
    - Full-text search with ranking
    - Category and section filtering
    - Pagination support
    - Result caching
    """
    try:
        # Try cache first
        cache_manager = get_cache_manager(db)
        cache_key = f"search:{q}:{category}:{section}:{limit}:{offset}"
        
        if cache_manager and hasattr(cache_manager, 'redis_cache') and cache_manager.redis_cache:
            try:
                cached = cache_manager.redis_cache.get(cache_key)
                if cached:
                    logger.info(f"Cache hit for search: {q}")
                    return json.loads(cached)
            except Exception as e:
                logger.warning(f"Cache error: {e}")
        
        # Build search query
        search_sql = """
            WITH search_results AS (
                SELECT 
                    id, name, section, title, description, category,
                    ts_rank(search_vector, plainto_tsquery('english', :query)) AS rank,
                    ts_headline('english', description, plainto_tsquery('english', :query),
                               'MaxWords=50, MinWords=20') AS snippet
                FROM man_pages
                WHERE search_vector @@ plainto_tsquery('english', :query)
                    AND (:category IS NULL OR category = :category)
                    AND (:section IS NULL OR section = :section)
            )
            SELECT *, COUNT(*) OVER() AS total_count
            FROM search_results
            ORDER BY rank DESC, name ASC
            LIMIT :limit OFFSET :offset
        """
        
        result = db.execute(
            text(search_sql),
            {
                "query": q,
                "category": category,
                "section": section,
                "limit": limit,
                "offset": offset
            }
        )
        
        rows = result.fetchall()
        
        # Format results
        results = []
        total = 0
        
        for row in rows:
            total = row.total_count if hasattr(row, 'total_count') else 0
            results.append({
                "id": str(row.id),
                "name": row.name,
                "section": row.section,
                "title": row.title,
                "description": row.description[:200] if row.description else None,
                "category": row.category,
                "relevance": float(row.rank) if row.rank else 0,
                "snippet": row.snippet if hasattr(row, 'snippet') else None
            })
        
        response = {
            "query": q,
            "results": results,
            "total": total,
            "limit": limit,
            "offset": offset,
            "filters": {
                "category": category,
                "section": section
            }
        }
        
        # Cache the results (5 minute TTL)
        if cache_manager and hasattr(cache_manager, 'redis_cache') and cache_manager.redis_cache:
            try:
                cache_manager.redis_cache.set(cache_key, json.dumps(response), expire=300)
            except Exception as e:
                logger.warning(f"Failed to cache results: {e}")
        
        # Update view counts for returned results
        if results:
            update_sql = """
                UPDATE man_pages 
                SET view_count = view_count + 1,
                    last_accessed = NOW()
                WHERE id = ANY(:ids)
            """
            db.execute(
                text(update_sql),
                {"ids": [r["id"] for r in results]}
            )
            db.commit()
        
        return response
        
    except Exception as e:
        logger.error(f"Search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/commands/{name}/{section}", response_model=ManPageDetail)
async def get_command(
    name: str = Path(..., description="Command name"),
    section: str = Path(..., description="Man page section"),
    db: Session = Depends(get_db)
) -> ManPageDetail:
    """Get detailed information about a specific command."""
    try:
        # Try cache first
        cache_manager = get_cache_manager(db)
        cache_key = f"command:{name}:{section}"
        
        if cache_manager and hasattr(cache_manager, 'redis_cache') and cache_manager.redis_cache:
            try:
                cached = cache_manager.redis_cache.get(cache_key)
                if cached:
                    logger.info(f"Cache hit for command: {name}({section})")
                    return ManPageDetail(**json.loads(cached))
            except Exception as e:
                logger.warning(f"Cache error: {e}")
        
        # Query database
        man_page = db.query(ManPage).filter(
            and_(ManPage.name == name, ManPage.section == section)
        ).first()
        
        if not man_page:
            raise HTTPException(
                status_code=404,
                detail=f"Command not found: {name}({section})"
            )
        
        # Update view count
        man_page.view_count = (man_page.view_count or 0) + 1
        man_page.last_accessed = datetime.utcnow()
        db.commit()
        
        # Prepare response
        response = man_page.to_dict()
        
        # Cache the result (1 hour TTL)
        if cache_manager and hasattr(cache_manager, 'redis_cache') and cache_manager.redis_cache:
            try:
                cache_manager.redis_cache.set(cache_key, json.dumps(response), expire=3600)
            except Exception as e:
                logger.warning(f"Failed to cache command: {e}")
        
        return ManPageDetail(**response)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching command {name}({section}): {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/commands", response_model=Dict[str, Any])
async def list_commands(
    category: Optional[str] = Query(None, description="Filter by category"),
    section: Optional[str] = Query(None, description="Filter by section"),
    is_common: Optional[bool] = Query(None, description="Filter common commands"),
    limit: int = Query(20, ge=1, le=100, description="Results per page"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """List all commands with filtering and pagination."""
    try:
        # Build query
        query = db.query(ManPage)
        
        # Apply filters
        if category:
            query = query.filter(ManPage.category == category)
        if section:
            query = query.filter(ManPage.section == section)
        if is_common is not None:
            query = query.filter(ManPage.is_common == is_common)
        
        # Get total count
        total = query.count()
        
        # Apply pagination and ordering
        commands = query.order_by(
            ManPage.name, ManPage.section
        ).offset(offset).limit(limit).all()
        
        # Format response
        return {
            "commands": [
                ManPageSummary(**cmd.to_dict()).dict()
                for cmd in commands
            ],
            "total": total,
            "limit": limit,
            "offset": offset,
            "filters": {
                "category": category,
                "section": section,
                "is_common": is_common
            }
        }
        
    except Exception as e:
        logger.error(f"Error listing commands: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/categories", response_model=List[CategoryInfo])
async def get_categories(db: Session = Depends(get_db)) -> List[CategoryInfo]:
    """Get all command categories with statistics."""
    try:
        # Try cache first
        cache_manager = get_cache_manager(db)
        cache_key = "categories:all"
        
        if cache_manager and hasattr(cache_manager, 'redis_cache') and cache_manager.redis_cache:
            try:
                cached = cache_manager.redis_cache.get(cache_key)
                if cached:
                    logger.info("Cache hit for categories")
                    return [CategoryInfo(**cat) for cat in json.loads(cached)]
            except Exception as e:
                logger.warning(f"Cache error: {e}")
        
        # Query categories with statistics
        category_sql = """
            SELECT 
                category as name,
                category as slug,
                COUNT(*) as command_count,
                ARRAY_AGG(name ORDER BY view_count DESC LIMIT 5) as popular_commands
            FROM man_pages
            WHERE category IS NOT NULL
            GROUP BY category
            ORDER BY command_count DESC
        """
        
        result = db.execute(text(category_sql))
        rows = result.fetchall()
        
        # Category metadata (icons and colors)
        category_meta = {
            "file_operations": {"icon": "📁", "color": "#4A90E2", "description": "File and directory management"},
            "text_processing": {"icon": "📝", "color": "#F5A623", "description": "Text manipulation and searching"},
            "network": {"icon": "🌐", "color": "#BD10E0", "description": "Network utilities and communication"},
            "system_info": {"icon": "ℹ️", "color": "#7ED321", "description": "System information and monitoring"},
            "user_management": {"icon": "👤", "color": "#D0021B", "description": "User and group management"},
            "archive": {"icon": "🗜️", "color": "#F8E71C", "description": "File compression and archiving"},
            "general": {"icon": "📄", "color": "#B8B8B8", "description": "General commands and utilities"}
        }
        
        categories = []
        for row in rows:
            meta = category_meta.get(row.name, {})
            categories.append({
                "name": row.name,
                "slug": row.name,
                "description": meta.get("description"),
                "icon": meta.get("icon"),
                "color": meta.get("color"),
                "command_count": row.command_count,
                "popular_commands": row.popular_commands[:5] if row.popular_commands else []
            })
        
        # Cache the results (2 hour TTL)
        if cache_manager and hasattr(cache_manager, 'redis_cache') and cache_manager.redis_cache:
            try:
                cache_manager.redis_cache.set(cache_key, json.dumps(categories), expire=7200)
            except Exception as e:
                logger.warning(f"Failed to cache categories: {e}")
        
        return [CategoryInfo(**cat) for cat in categories]
        
    except Exception as e:
        logger.error(f"Error fetching categories: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/popular", response_model=List[PopularCommand])
async def get_popular_commands(
    period: str = Query("weekly", regex="^(daily|weekly|monthly|all_time)$"),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db)
) -> List[PopularCommand]:
    """Get popular commands based on view counts and recent access."""
    try:
        # Try cache first
        cache_manager = get_cache_manager(db)
        cache_key = f"popular:{period}:{limit}"
        
        if cache_manager and hasattr(cache_manager, 'redis_cache') and cache_manager.redis_cache:
            try:
                cached = cache_manager.redis_cache.get(cache_key)
                if cached:
                    logger.info(f"Cache hit for popular commands: {period}")
                    return [PopularCommand(**cmd) for cmd in json.loads(cached)]
            except Exception as e:
                logger.warning(f"Cache error: {e}")
        
        # Build date filter based on period
        date_filter = ""
        if period == "daily":
            date_filter = "AND last_accessed >= NOW() - INTERVAL '1 day'"
        elif period == "weekly":
            date_filter = "AND last_accessed >= NOW() - INTERVAL '7 days'"
        elif period == "monthly":
            date_filter = "AND last_accessed >= NOW() - INTERVAL '30 days'"
        
        # Query popular commands
        popular_sql = f"""
            WITH ranked_commands AS (
                SELECT 
                    id, name, section, title, description, category,
                    view_count, is_common,
                    ROW_NUMBER() OVER (ORDER BY view_count DESC) AS rank,
                    view_count::float AS score,
                    CASE 
                        WHEN LAG(view_count) OVER (ORDER BY view_count DESC) > view_count THEN 'falling'
                        WHEN LAG(view_count) OVER (ORDER BY view_count DESC) < view_count THEN 'rising'
                        ELSE 'stable'
                    END AS trend
                FROM man_pages
                WHERE view_count > 0 {date_filter}
                ORDER BY view_count DESC
                LIMIT :limit
            )
            SELECT * FROM ranked_commands
        """
        
        result = db.execute(text(popular_sql), {"limit": limit})
        rows = result.fetchall()
        
        # Format results
        commands = []
        for row in rows:
            commands.append({
                "id": str(row.id),
                "name": row.name,
                "section": row.section,
                "title": row.title,
                "description": row.description[:200] if row.description else None,
                "category": row.category,
                "is_common": row.is_common,
                "view_count": row.view_count,
                "rank": row.rank,
                "score": row.score,
                "trend": row.trend
            })
        
        # Cache the results (30 minute TTL)
        if cache_manager and hasattr(cache_manager, 'redis_cache') and cache_manager.redis_cache:
            try:
                cache_manager.redis_cache.set(cache_key, json.dumps(commands), expire=1800)
            except Exception as e:
                logger.warning(f"Failed to cache popular commands: {e}")
        
        return [PopularCommand(**cmd) for cmd in commands]
        
    except Exception as e:
        logger.error(f"Error fetching popular commands: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/related/{name}", response_model=List[ManPageSummary])
async def get_related_commands(
    name: str = Path(..., description="Command name"),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db)
) -> List[ManPageSummary]:
    """Get commands related to the specified command."""
    try:
        # Try cache first
        cache_manager = get_cache_manager(db)
        cache_key = f"related:{name}:{limit}"
        
        if cache_manager and hasattr(cache_manager, 'redis_cache') and cache_manager.redis_cache:
            try:
                cached = cache_manager.redis_cache.get(cache_key)
                if cached:
                    logger.info(f"Cache hit for related commands: {name}")
                    return [ManPageSummary(**cmd) for cmd in json.loads(cached)]
            except Exception as e:
                logger.warning(f"Cache error: {e}")
        
        # First, get the command to find its category and related_commands
        source_cmd = db.query(ManPage).filter(ManPage.name == name).first()
        
        if not source_cmd:
            raise HTTPException(status_code=404, detail=f"Command not found: {name}")
        
        related = []
        
        # 1. Use stored related_commands if available
        if source_cmd.related_commands:
            for related_name in source_cmd.related_commands[:limit]:
                cmd = db.query(ManPage).filter(ManPage.name == related_name).first()
                if cmd and cmd.name != name:
                    related.append(cmd.to_dict())
        
        # 2. Find commands in the same category
        if len(related) < limit and source_cmd.category:
            category_commands = db.query(ManPage).filter(
                and_(
                    ManPage.category == source_cmd.category,
                    ManPage.name != name
                )
            ).order_by(ManPage.view_count.desc()).limit(limit - len(related)).all()
            
            for cmd in category_commands:
                if not any(r["name"] == cmd.name for r in related):
                    related.append(cmd.to_dict())
        
        # 3. Use text similarity as fallback
        if len(related) < limit:
            similarity_sql = """
                SELECT *
                FROM man_pages
                WHERE name != :name
                AND name % :name  -- PostgreSQL similarity operator
                ORDER BY similarity(name, :name) DESC
                LIMIT :limit
            """
            
            result = db.execute(
                text(similarity_sql),
                {"name": name, "limit": limit - len(related)}
            )
            
            for row in result:
                if not any(r["name"] == row.name for r in related):
                    related.append({
                        "id": str(row.id),
                        "name": row.name,
                        "section": row.section,
                        "title": row.title,
                        "description": row.description,
                        "category": row.category,
                        "is_common": row.is_common,
                        "view_count": row.view_count
                    })
        
        # Limit and format results
        related = related[:limit]
        
        # Cache the results (1 hour TTL)
        if cache_manager and hasattr(cache_manager, 'redis_cache') and cache_manager.redis_cache:
            try:
                cache_manager.redis_cache.set(cache_key, json.dumps(related), expire=3600)
            except Exception as e:
                logger.warning(f"Failed to cache related commands: {e}")
        
        return [ManPageSummary(**cmd) for cmd in related]
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching related commands for {name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Health check for man pages data
@router.get("/health")
async def man_pages_health(db: Session = Depends(get_db)):
    """Check health of man pages data and services."""
    try:
        # Check database
        man_count = db.query(func.count(ManPage.id)).scalar()
        categories = db.query(func.count(func.distinct(ManPage.category))).scalar()
        
        # Check cache
        cache_status = "unavailable"
        cache_manager = get_cache_manager(db)
        if cache_manager:
            try:
                # Check for redis_cache attribute (used by existing cache manager)
                if hasattr(cache_manager, 'redis_cache') and cache_manager.redis_cache:
                    cache_status = "healthy"
                elif hasattr(cache_manager, 'redis_client') and cache_manager.redis_client:
                    cache_manager.redis_client.ping()
                    cache_status = "healthy"
            except Exception:
                cache_status = "unhealthy"
        
        return {
            "status": "healthy",
            "database": {
                "man_pages": man_count,
                "categories": categories
            },
            "cache": cache_status,
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={
                "status": "unhealthy",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }
        )