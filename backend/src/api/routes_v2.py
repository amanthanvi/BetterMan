"""
API routes v2 using service layer architecture.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
import logging

from ..db.session import get_db
from ..models.document import DocumentResponse, SearchResult
from ..services import DocumentService, SearchService, CacheService, ParserService
from ..errors import NotFoundError, ValidationError, ParseError
from ..auth.dependencies import OptionalUser, get_current_user_optional
from ..config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Create router
router = APIRouter(prefix="/v2", tags=["documents-v2"])

# Service dependencies
def get_cache_service() -> CacheService:
    """Get cache service instance."""
    return CacheService(redis_url=settings.REDIS_URL)

def get_document_service(
    db: Session = Depends(get_db),
    cache: CacheService = Depends(get_cache_service)
) -> DocumentService:
    """Get document service instance."""
    from ..cache.cache_manager import CacheManager
    cache_manager = CacheManager(db, None)
    return DocumentService(db, cache_manager)

def get_search_service(db: Session = Depends(get_db)) -> SearchService:
    """Get search service instance."""
    return SearchService(db)

def get_parser_service(
    db: Session = Depends(get_db),
    cache: CacheService = Depends(get_cache_service)
) -> ParserService:
    """Get parser service instance."""
    return ParserService(db, cache)


@router.get("/documents", response_model=List[DocumentResponse])
async def list_documents(
    category: Optional[str] = Query(None, description="Filter by category"),
    section: Optional[int] = Query(None, ge=1, le=9, description="Filter by section"),
    is_common: Optional[bool] = Query(None, description="Filter by common status"),
    limit: int = Query(50, ge=1, le=100, description="Results per page"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    service: DocumentService = Depends(get_document_service),
    current_user: OptionalUser = Depends(get_current_user_optional)
) -> List[DocumentResponse]:
    """
    List available documentation with filtering and pagination.
    
    This endpoint provides a paginated list of available documentation
    with optional filtering by category, section, or common status.
    """
    try:
        documents = service.list_documents(
            category=category,
            section=section,
            is_common=is_common,
            limit=limit,
            offset=offset
        )
        
        # Convert to response models
        return [DocumentResponse.from_orm(doc) for doc in documents]
        
    except Exception as e:
        logger.error(f"Error listing documents: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve documents"
        )


@router.get("/documents/{name}", response_model=DocumentResponse)
async def get_document(
    name: str,
    force_refresh: bool = Query(False, description="Force re-parse"),
    service: DocumentService = Depends(get_document_service),
    parser: ParserService = Depends(get_parser_service),
    current_user: OptionalUser = Depends(get_current_user_optional)
) -> DocumentResponse:
    """
    Get a specific document by name.
    
    This endpoint retrieves a single document by its name. If the document
    is not in the database, it will attempt to parse it from the system.
    """
    try:
        # Try to get from database first
        try:
            document = service.get_by_name(name)
            
            # Increment access count
            service.increment_access_count(name)
            
            # Check if refresh is requested
            if force_refresh:
                parsed = parser.parse_man_page(name, force_refresh=True)
                document = parser.update_database(parsed)
            
            return DocumentResponse.from_orm(document)
            
        except NotFoundError:
            # Try to parse from system
            parsed = parser.parse_man_page(name)
            document = parser.update_database(parsed)
            return DocumentResponse.from_orm(document)
            
    except NotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document '{name}' not found"
        )
    except ParseError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Failed to parse document: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error retrieving document {name}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve document"
        )


@router.get("/search", response_model=SearchResult)
async def search_documents(
    q: str = Query(..., min_length=1, description="Search query"),
    section: Optional[int] = Query(None, ge=1, le=9, description="Filter by section"),
    category: Optional[str] = Query(None, description="Filter by category"),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(10, ge=1, le=50, description="Results per page"),
    service: SearchService = Depends(get_search_service),
    current_user: OptionalUser = Depends(get_current_user_optional)
) -> SearchResult:
    """
    Search documents with advanced filtering.
    
    This endpoint provides full-text search across all documents with
    support for filtering by section and category.
    """
    try:
        results = service.search(
            query=q,
            section=section,
            category=category,
            page=page,
            per_page=per_page
        )
        
        return SearchResult(**results)
        
    except ValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Search error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Search failed"
        )


@router.get("/search/suggest")
async def search_suggestions(
    prefix: str = Query(..., min_length=2, description="Search prefix"),
    limit: int = Query(10, ge=1, le=20, description="Maximum suggestions"),
    service: SearchService = Depends(get_search_service)
) -> List[Dict[str, Any]]:
    """
    Get search suggestions based on prefix.
    
    This endpoint provides autocomplete suggestions for search queries.
    """
    try:
        suggestions = service.suggest(prefix=prefix, limit=limit)
        return suggestions
        
    except Exception as e:
        logger.error(f"Suggestion error: {e}")
        return []


@router.get("/categories")
async def get_categories(
    service: DocumentService = Depends(get_document_service)
) -> List[str]:
    """Get all available document categories."""
    try:
        return service.get_categories()
    except Exception as e:
        logger.error(f"Error getting categories: {e}")
        return []


@router.get("/sections")
async def get_sections(
    service: DocumentService = Depends(get_document_service)
) -> List[int]:
    """Get all available document sections."""
    try:
        return service.get_sections()
    except Exception as e:
        logger.error(f"Error getting sections: {e}")
        return []


@router.get("/popular", response_model=List[DocumentResponse])
async def get_popular_documents(
    limit: int = Query(10, ge=1, le=50, description="Maximum results"),
    service: DocumentService = Depends(get_document_service)
) -> List[DocumentResponse]:
    """Get most popular documents based on access count."""
    try:
        documents = service.get_popular_documents(limit=limit)
        return [DocumentResponse.from_orm(doc) for doc in documents]
    except Exception as e:
        logger.error(f"Error getting popular documents: {e}")
        return []


@router.get("/stats")
async def get_statistics(
    document_service: DocumentService = Depends(get_document_service),
    search_service: SearchService = Depends(get_search_service),
    cache_service: CacheService = Depends(get_cache_service),
    current_user: OptionalUser = Depends(get_current_user_optional)
) -> Dict[str, Any]:
    """Get system statistics."""
    try:
        stats = {
            "documents": {
                "total": document_service.get_document_count(),
                "by_section": {
                    section: document_service.get_document_count(section=section)
                    for section in range(1, 9)
                },
                "categories": len(document_service.get_categories())
            },
            "search": search_service.get_search_stats(),
            "cache": cache_service.get_stats()
        }
        
        return stats
        
    except Exception as e:
        logger.error(f"Error getting statistics: {e}")
        return {"error": "Failed to retrieve statistics"}


@router.post("/refresh/{name}")
async def refresh_document(
    name: str,
    background_tasks: BackgroundTasks,
    parser: ParserService = Depends(get_parser_service),
    current_user: OptionalUser = Depends(get_current_user_optional)
) -> Dict[str, str]:
    """
    Refresh a document by re-parsing it.
    
    This endpoint triggers a re-parse of the specified document.
    """
    try:
        # Add to background tasks
        background_tasks.add_task(
            parser.parse_man_page,
            name,
            force_refresh=True
        )
        
        return {"status": "refresh_scheduled", "document": name}
        
    except Exception as e:
        logger.error(f"Error scheduling refresh for {name}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to schedule refresh"
        )


@router.post("/cache/clear")
async def clear_cache(
    pattern: Optional[str] = Query(None, description="Pattern to clear (e.g., 'doc:*')"),
    cache_service: CacheService = Depends(get_cache_service),
    current_user: OptionalUser = Depends(get_current_user_optional)
) -> Dict[str, Any]:
    """
    Clear cache entries.
    
    This endpoint allows clearing cache entries, optionally filtered by pattern.
    Requires authentication.
    """
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required"
        )
    
    try:
        if pattern:
            count = cache_service.invalidate_pattern(pattern)
            return {"cleared": count, "pattern": pattern}
        else:
            success = cache_service.clear_all()
            return {"cleared": "all" if success else "failed"}
            
    except Exception as e:
        logger.error(f"Error clearing cache: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to clear cache"
        )