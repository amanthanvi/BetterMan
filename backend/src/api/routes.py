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
from ..jobs.scheduler import get_scheduler

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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

    # Record this access for analytics
    client_ip = request.client.host if request.client else "unknown"
    logger.info(f"Document request for {doc_id} from {client_ip}")

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
async def search_documents(
    request: Request,
    q: str = Query(..., min_length=1, description="Search query"),
    doc_set: Optional[str] = None,
    section: Optional[int] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    cache_manager: CacheManager = Depends(get_cache_manager),
):
    """Search documentation pages.

    Args:
        q: Search query
        doc_set: Filter by document set (e.g., 'linux')
        section: Filter by section number
        page: Page number (1-indexed)
        per_page: Results per page
    """
    try:
        # Log the search query to help with debugging
        logger.info(f"Search query: '{q}'")

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
async def import_document(
    name: str,
    section: Optional[int] = None,
    force: bool = False,
    cache_manager: CacheManager = Depends(get_cache_manager),
):
    """Import a specific document on demand.

    Args:
        name: Document name
        section: Document section
        force: Force re-import even if already exists
    """
    # Check if document already exists
    if not force:
        existing = (
            cache_manager.db.query(Document).filter(Document.name == name).first()
        )
        if existing:
            return {
                "message": f"Document '{name}' already exists",
                "document_id": existing.id,
            }

    # Process and cache the document
    document = cache_manager.process_and_cache(name, section)

    if not document:
        raise HTTPException(
            status_code=404,
            detail=f"Man page '{name}' not found or could not be processed",
        )

    return {
        "message": f"Document '{name}' imported successfully",
        "document_id": document.id,
    }


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


@router.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}
