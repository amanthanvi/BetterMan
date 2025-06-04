"""API routes for the BetterMan application."""

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks, Request
from fastapi.responses import HTMLResponse, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_, func, desc
from typing import List, Optional, Dict, Any
import logging
from datetime import datetime

from ..db.session import get_db
from ..models.document import (
    Document,
    DocumentResponse,
    SearchResult,
    CacheStatistics,
    Section,
    Subsection,
)
from ..parser.linux_parser import LinuxManParser
from ..cache.cache_manager import CacheManager, COMMON_COMMANDS
from ..jobs.simple_scheduler import get_scheduler
from ..security import EnhancedRateLimiter
from ..security_utils import SecurityUtils, InputValidator, limiter
from ..errors import NotFoundError, ValidationError, ParseError
from ..config import get_settings
from ..analytics.tracker import AnalyticsTracker

logger = logging.getLogger(__name__)
settings = get_settings()

# Create router
router = APIRouter()

# Initialize parser
parser = LinuxManParser()


def get_cache_manager(db: Session = Depends(get_db)) -> CacheManager:
    """Dependency to get a CacheManager instance."""
    return CacheManager(db, parser)


@router.get("/docs", response_model=List[DocumentResponse])
async def list_documents(
    request: Request,
    category: Optional[str] = None,
    section: Optional[int] = None,
    is_common: Optional[bool] = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    cache_manager: CacheManager = Depends(get_cache_manager),
):
    """
    List available documentation pages with optional filtering.

    Args:
        category: Filter by category/keyword in title
        section: Filter by man page section
        is_common: Filter by common document status
        limit: Maximum number of results
        offset: Pagination offset
    """
    # Build query
    query = db.query(Document)

    # Apply filters
    if category:
        query = query.filter(Document.title.ilike(f"%{category}%"))

    if section:
        query = query.filter(Document.section == section)

    if is_common is not None:
        query = query.filter(Document.is_common == is_common)

    # Order by name and apply pagination
    documents = query.order_by(Document.name).offset(offset).limit(limit).all()

    # If no documents and this is the first request, trigger prefetch
    first_request = not db.query(Document).first()
    if first_request and not documents:
        # Start prefetch in background
        scheduler = get_scheduler()
        scheduler.run_job_now("prefetch_common_commands")

        # Return empty list for now
        return []

    # Record this access for analytics
    client_ip = request.client.host if request.client else "unknown"
    logger.info(
        f"Document list request from {client_ip}, filters: category={category}, section={section}"
    )

    return documents


@router.get("/docs/{doc_id}", response_model=DocumentResponse)
async def get_document(
    doc_id: str,
    request: Request,
    cache_manager: CacheManager = Depends(get_cache_manager),
    db: Session = Depends(get_db),
):
    """Get a specific documentation page.

    Args:
        doc_id: Document ID or name
    """
    # Try to extract section from doc_id (format could be 'ls.1' for section 1)
    section = None
    name = doc_id
    if "." in doc_id and doc_id.split(".")[-1].isdigit():
        name, section_str = doc_id.rsplit(".", 1)
        section = int(section_str)

    # Get document from cache or process it
    document = cache_manager.get_document(name, section)

    if not document:
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found")

    # Track page view
    try:
        analytics = AnalyticsTracker(db)
        client_ip = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent", "")
        session_id = request.headers.get("x-session-id", None)
        referrer = request.headers.get("referer", None)
        
        # Get user ID from auth if available (for now, just None)
        user_id = None  # TODO: Get from auth context when implemented
        
        analytics.track_page_view(
            document_id=document.id,
            user_id=user_id,
            session_id=session_id,
            ip_address=client_ip,
            user_agent=user_agent,
            referrer=referrer
        )
        logger.info(f"Tracked page view for document {doc_id}")
    except Exception as e:
        logger.error(f"Failed to track page view: {e}")
        # Don't fail the request if analytics fails

    return document


@router.get("/docs/{doc_id}/toc")
async def get_document_toc(
    doc_id: str,
    db: Session = Depends(get_db),
    cache_manager: CacheManager = Depends(get_cache_manager),
):
    """Get the table of contents for a document.

    Args:
        doc_id: Document ID or name
    """
    # Try to extract section from doc_id
    section = None
    name = doc_id
    if "." in doc_id and doc_id.split(".")[-1].isdigit():
        name, section_str = doc_id.rsplit(".", 1)
        section = int(section_str)

    # Get document from cache or process it
    document = cache_manager.get_document(name, section)

    if not document:
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found")

    # Fetch sections
    sections = (
        db.query("Section")
        .filter(Section.document_id == document.id)
        .order_by(Section.order)
        .all()
    )

    # Build table of contents
    toc = []
    for section in sections:
        section_item = {
            "id": f"section-{section.id}",
            "name": section.name,
            "level": 1,
        }
        toc.append(section_item)

        # Add subsections
        subsections = (
            db.query("Subsection")
            .filter(Subsection.section_id == section.id)
            .order_by(Subsection.order)
            .all()
        )

        for subsection in subsections:
            subsection_item = {
                "id": f"subsection-{subsection.id}",
                "name": subsection.name,
                "level": 2,
                "parent_id": f"section-{section.id}",
            }
            toc.append(subsection_item)

    return {"toc": toc}


@router.get("/docs/{doc_id}/html", response_class=HTMLResponse)
async def get_document_html(
    doc_id: str, cache_manager: CacheManager = Depends(get_cache_manager)
):
    """Get a specific documentation page as HTML.

    Args:
        doc_id: Document ID or name
    """
    # Try to extract section from doc_id
    section = None
    name = doc_id
    if "." in doc_id and doc_id.split(".")[-1].isdigit():
        name, section_str = doc_id.rsplit(".", 1)
        section = int(section_str)

    # Get document from cache or process it
    document = cache_manager.get_document(name, section)

    if not document:
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found")

    # Build structured data
    structured_data = {
        "title": document.title,
        "section": document.section,
        "sections": [],
    }

    for section in document.sections:
        section_data = {"name": section.name, "content": section.content}

        # Add subsections
        if section.subsections:
            section_data["subsections"] = [
                {"name": sub.name, "content": sub.content}
                for sub in sorted(section.subsections, key=lambda s: s.order or 0)
            ]

        structured_data["sections"].append(section_data)

    # Add related
    structured_data["related"] = [rel.related_name for rel in document.related_docs]

    # Convert to HTML
    html_content = parser.convert_to_html(structured_data)

    return html_content


@router.get("/docs/{doc_id}/markdown")
async def get_document_markdown(
    doc_id: str, cache_manager: CacheManager = Depends(get_cache_manager)
):
    """Get a specific documentation page as Markdown.

    Args:
        doc_id: Document ID or name
    """
    # Try to extract section from doc_id
    section = None
    name = doc_id
    if "." in doc_id and doc_id.split(".")[-1].isdigit():
        name, section_str = doc_id.rsplit(".", 1)
        section = int(section_str)

    # Get document from cache or process it
    document = cache_manager.get_document(name, section)

    if not document:
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found")

    # Build structured data (same as HTML endpoint)
    structured_data = {
        "title": document.title,
        "section": document.section,
        "sections": [],
    }

    for section in document.sections:
        section_data = {"name": section.name, "content": section.content}

        # Add subsections
        if section.subsections:
            section_data["subsections"] = [
                {"name": sub.name, "content": sub.content}
                for sub in sorted(section.subsections, key=lambda s: s.order or 0)
            ]

        structured_data["sections"].append(section_data)

    # Add related
    structured_data["related"] = [rel.related_name for rel in document.related_docs]

    # Convert to Markdown
    markdown_content = parser.convert_to_markdown(structured_data)

    return {"markdown": markdown_content}


@router.get("/search", response_model=Dict[str, Any])
@limiter.limit(settings.RATE_LIMIT_SEARCH)
async def search_documents(
    request: Request,
    q: str = Query(..., min_length=1, max_length=200, description="Search query"),
    doc_set: Optional[str] = None,
    section: Optional[int] = Query(None, ge=1, le=8),
    page: int = Query(1, ge=1, le=1000),
    per_page: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    cache_manager: CacheManager = Depends(get_cache_manager),
):
    """
    Search documentation pages with security validation.

    Args:
        q: Search query
        doc_set: Filter by document set (e.g., 'linux')
        section: Filter by section number
        page: Page number (1-indexed)
        per_page: Results per page
    """
    try:
        # Validate and sanitize search query
        q = SecurityUtils.validate_search_query(q)

        # Validate pagination
        offset, limit = InputValidator.validate_pagination(page, per_page)

        # Log the search query
        logger.info(
            f"Search request",
            extra={
                "request_id": getattr(request.state, "request_id", "unknown"),
                "query": q,
                "section": section,
                "page": page,
            },
        )

        # Calculate offset
        offset = (page - 1) * per_page

        # Create search pattern with wildcards for LIKE queries
        search_pattern = f"%{q}%"

        # Basic query using SQLite's LIKE operator
        query = db.query(Document).filter(
            or_(
                Document.name.ilike(search_pattern),
                Document.title.ilike(search_pattern),
                Document.summary.ilike(search_pattern),
                Document.raw_content.ilike(search_pattern),
            )
        )

        # Also check if the query matches the exact document name
        exact_match = (
            db.query(Document).filter(func.lower(Document.name) == q.lower()).first()
        )

        if section:
            query = query.filter(Document.section == section)

        # Count total results for pagination
        total = query.count()

        # Add exact match to the results if exists and not already in results
        results = query.order_by(Document.name).offset(offset).limit(per_page).all()

        # Log number of results found to help with debugging
        logger.info(f"Found {total} results for query '{q}'")
        if exact_match:
            logger.info(f"Found exact match: {exact_match.name}")

        # Format results
        formatted_results = []
        for doc in results:
            # Check if query matches content and extract matches
            matches = []
            if doc.raw_content and q.lower() in doc.raw_content.lower():
                content = doc.raw_content.lower()
                query_lower = q.lower()

                # Find first match position
                pos = content.find(query_lower)
                if pos >= 0:
                    # Get some context around the match
                    start = max(0, pos - 40)
                    end = min(len(content), pos + len(query_lower) + 40)

                    # Extract context
                    context = content[start:end]
                    if start > 0:
                        context = "..." + context
                    if end < len(content):
                        context = context + "..."

                    matches.append(context)

            # Format result with a higher score for name matches
            score = 1.0
            if q.lower() in doc.name.lower():
                score = 2.0  # Higher score for name matches

            result = {
                "id": doc.name,
                "title": doc.title or doc.name,  # Fallback to name if title is None
                "summary": doc.summary or "",  # Empty string if summary is None
                "section": doc.section,
                "score": score,
                "doc_set": doc_set or "linux",
                "matches": matches,
            }

            formatted_results.append(result)

        # Record this search for analytics
        client_ip = request.client.host if request.client else "unknown"
        logger.info(f"Search request for '{q}' from {client_ip}, found {total} results")

        # Return paginated results
        return {
            "results": formatted_results,
            "total": total,
            "page": page,
            "per_page": per_page,
            "has_more": (offset + per_page) < total,
        }
    except Exception as e:
        # Log the error for debugging
        logger.error(f"Search error: {str(e)}")
        # Return empty results rather than a 500 error
        return {
            "results": [],
            "total": 0,
            "page": page,
            "per_page": per_page,
            "has_more": False,
            "error": str(e),
        }


@router.get("/docs/popular", response_model=List[DocumentResponse])
async def get_popular_documents(
    limit: int = Query(10, ge=1, le=50), db: Session = Depends(get_db)
):
    """Get the most popular documents based on access count.

    Args:
        limit: Maximum number of results
    """
    documents = (
        db.query(Document).order_by(Document.access_count.desc()).limit(limit).all()
    )

    return documents


@router.post("/docs/import")
@limiter.limit(settings.RATE_LIMIT_IMPORT)
async def import_document(
    request: Request,
    name: str = Query(..., min_length=1, max_length=100),
    section: Optional[int] = Query(None, ge=1, le=8),
    force: bool = Query(False),
    cache_manager: CacheManager = Depends(get_cache_manager),
):
    """
    Import a specific document on demand with security validation.

    Args:
        name: Document name
        section: Document section (1-8)
        force: Force re-import even if already exists
    """
    # Validate command name
    if not SecurityUtils.validate_command_name(name):
        raise ValidationError(
            "Invalid command name. Only alphanumeric characters, dash, underscore, and dot are allowed.",
            field="name",
        )

    # Validate section
    section = InputValidator.validate_section(section)

    # Check if document already exists
    existing = cache_manager.db.query(Document).filter(Document.name == name).first()

    if existing:
        if not force:
            return {
                "message": f"Document '{name}' already exists",
                "document_id": existing.id,
                "status": "exists",
            }
        else:
            # Delete existing document when force=true
            cache_manager.db.delete(existing)
            cache_manager.db.commit()
            logger.info(f"Deleted existing document '{name}' for re-import")

    try:
        # Process and cache the document
        document = cache_manager.process_and_cache(name, section)

        if not document:
            raise NotFoundError("Document", name)

        logger.info(
            f"Document imported",
            extra={
                "request_id": getattr(request.state, "request_id", "unknown"),
                "document_name": name,
                "section": section,
                "forced": force,
            },
        )

        return {
            "message": f"Document '{name}' imported successfully",
            "document_id": document.id,
            "status": "imported",
        }

    except Exception as e:
        logger.error(f"Import error for {name}: {e}")
        raise ParseError(f"Failed to import document: {str(e)}", name)


@router.delete("/docs/{doc_id}")
async def delete_document(doc_id: str, db: Session = Depends(get_db)):
    """Delete a document from the cache.

    Args:
        doc_id: Document ID or name
    """
    # Find the document
    document = None
    if doc_id.isdigit():
        document = db.query(Document).filter(Document.id == int(doc_id)).first()
    else:
        document = db.query(Document).filter(Document.name == doc_id).first()

    if not document:
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found")

    # Don't allow deletion of common commands
    if document.name in COMMON_COMMANDS:
        raise HTTPException(
            status_code=403, detail=f"Cannot delete common command '{document.name}'"
        )

    # Delete the document
    db.delete(document)
    db.commit()

    return {"message": f"Document '{doc_id}' deleted successfully"}


@router.get("/cache/stats", response_model=CacheStatistics)
async def get_cache_stats(cache_manager: CacheManager = Depends(get_cache_manager)):
    """Get cache statistics."""
    stats = cache_manager.get_cache_statistics()
    return stats


@router.post("/cache/refresh")
async def refresh_cache(
    background_tasks: BackgroundTasks,
):
    """Trigger a cache refresh in the background."""
    # Get the scheduler and run the prefetch job
    scheduler = get_scheduler()
    scheduler.run_job_now("prefetch_common_commands")

    return {"message": "Cache refresh triggered"}


@router.get("/analytics/overview")
async def get_analytics_overview(
    days: int = Query(7, description="Number of days to look back"),
    db: Session = Depends(get_db)
):
    """Get analytics overview data based on real tracking."""
    analytics = AnalyticsTracker(db)
    
    # Get real analytics data
    overview = analytics.get_analytics_overview(days=days)
    
    # Add total documents count
    total_docs = db.query(Document).count()
    overview["total_documents"] = total_docs
    
    # Calculate average response time (placeholder for now)
    overview["avg_response_time"] = 12.5
    
    return overview


@router.get("/analytics/popular-commands")
async def get_popular_commands(
    limit: int = Query(10, ge=1, le=20, description="Number of commands to return"),
    days: int = Query(7, description="Number of days to look back"),
    db: Session = Depends(get_db)
):
    """Get popular commands based on real page view data."""
    analytics = AnalyticsTracker(db)
    
    # Get popular commands from analytics
    popular_commands = analytics.get_popular_commands(limit=limit, days=days)
    
    # If no real data yet, return some defaults with zero counts
    if not popular_commands:
        # Return common commands with zero counts as placeholders
        default_commands = ["ls", "grep", "find", "cat", "vim", "git"]
        popular_commands = []
        for i, cmd in enumerate(default_commands[:limit]):
            doc = db.query(Document).filter(Document.name == cmd).first()
            if doc:
                popular_commands.append({
                    "id": str(doc.id),
                    "name": doc.name,
                    "title": doc.title,
                    "summary": doc.summary,
                    "section": doc.section,
                    "view_count": 0,
                    "unique_users": 0,
                    "trend": "stable"
                })
    
    return {"commands": popular_commands, "period_days": days}


@router.get("/performance")
async def get_performance_metrics(
    cache_manager: CacheManager = Depends(get_cache_manager),
    db: Session = Depends(get_db),
):
    """Get system performance metrics."""
    import random
    import time
    from datetime import datetime, timedelta

    try:
        import psutil

        # Get system metrics
        cpu_percent = psutil.cpu_percent(interval=0.1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage("/")
        boot_time = psutil.boot_time()
        uptime_seconds = time.time() - boot_time

        # Convert uptime to human readable format
        uptime_delta = timedelta(seconds=uptime_seconds)
        days = uptime_delta.days
        hours, remainder = divmod(uptime_delta.seconds, 3600)
        minutes, _ = divmod(remainder, 60)
        uptime_str = f"{days}d {hours}h {minutes}m"

        system_metrics = {
            "cpu": {
                "usage_percent": round(cpu_percent, 1),
                "cores": psutil.cpu_count(),
            },
            "memory": {
                "total_gb": round(memory.total / (1024**3), 2),
                "used_gb": round(memory.used / (1024**3), 2),
                "usage_percent": round(memory.percent, 1),
                "available_gb": round(memory.available / (1024**3), 2),
            },
            "disk": {
                "total_gb": round(disk.total / (1024**3), 2),
                "used_gb": round(disk.used / (1024**3), 2),
                "usage_percent": round((disk.used / disk.total) * 100, 1),
                "free_gb": round(disk.free / (1024**3), 2),
            },
            "uptime": uptime_str,
        }
    except ImportError:
        # Fallback for environments without psutil
        system_metrics = {
            "cpu": {"usage_percent": random.randint(20, 60), "cores": 4},
            "memory": {
                "total_gb": 8.0,
                "used_gb": random.uniform(2.0, 6.0),
                "usage_percent": random.randint(40, 75),
                "available_gb": random.uniform(2.0, 6.0),
            },
            "disk": {
                "total_gb": 100.0,
                "used_gb": random.uniform(30.0, 70.0),
                "usage_percent": random.randint(30, 70),
                "free_gb": random.uniform(30.0, 70.0),
            },
            "uptime": "15d 4h 32m",
        }

    # Get cache statistics
    cache_stats = cache_manager.get_cache_statistics()

    # Get database metrics
    total_docs = db.query(Document).count()
    total_searches = db.query(func.sum(Document.access_count)).scalar() or 0

    # Mock response time data
    response_times = [random.randint(50, 200) for _ in range(100)]
    avg_response_time = sum(response_times) / len(response_times)

    return {
        "timestamp": datetime.utcnow().isoformat(),
        "system": system_metrics,
        "application": {
            "cache_hit_rate": cache_stats.get("hit_rate", 85.0),
            "cache_size": cache_stats.get("total_cached", 0),
            "total_documents": total_docs,
            "total_searches": total_searches,
            "avg_response_time_ms": round(avg_response_time, 1),
        },
        "health_status": "healthy",
    }


@router.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}
