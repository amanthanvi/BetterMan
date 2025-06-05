"""
User-specific API routes for favorites and search history.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List, Optional
from datetime import datetime
import logging

from ..db.session import get_db
from ..models.user import User, UserFavorite as Favorite, SearchHistory
from ..models.document import Document, DocumentResponse
from ..auth.dependencies import CurrentUser
from ..errors import NotFoundError, ValidationError
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/user", tags=["user"])


class FavoriteCreate(BaseModel):
    document_id: int
    notes: Optional[str] = None


class FavoriteResponse(BaseModel):
    id: int
    document_id: int
    document: DocumentResponse
    notes: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True


class SearchHistoryResponse(BaseModel):
    id: int
    query: str
    results_count: int
    clicked_result_id: Optional[int]
    created_at: datetime
    
    class Config:
        from_attributes = True


@router.get("/favorites", response_model=List[FavoriteResponse])
async def get_user_favorites(
    current_user: CurrentUser,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """Get current user's favorite documents."""
    favorites = db.query(Favorite).filter(
        Favorite.user_id == current_user.id
    ).order_by(
        desc(Favorite.created_at)
    ).offset(offset).limit(limit).all()
    
    # Manually construct response with document data
    response = []
    for fav in favorites:
        if fav.document:  # Ensure document exists
            response.append(FavoriteResponse(
                id=fav.id,
                document_id=fav.document_id,
                document=DocumentResponse.from_orm(fav.document),
                notes=fav.notes,
                created_at=fav.created_at
            ))
    
    return response


@router.post("/favorites", response_model=FavoriteResponse, status_code=status.HTTP_201_CREATED)
async def add_favorite(
    favorite_data: FavoriteCreate,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    """Add a document to user's favorites."""
    # Check if document exists
    document = db.query(Document).filter(
        Document.id == favorite_data.document_id
    ).first()
    
    if not document:
        raise NotFoundError("Document", str(favorite_data.document_id))
    
    # Check if already favorited
    existing = db.query(Favorite).filter(
        Favorite.user_id == current_user.id,
        Favorite.document_id == favorite_data.document_id
    ).first()
    
    if existing:
        # Update notes if provided
        if favorite_data.notes is not None:
            existing.notes = favorite_data.notes
            db.commit()
            db.refresh(existing)
        
        return FavoriteResponse(
            id=existing.id,
            document_id=existing.document_id,
            document=DocumentResponse.from_orm(document),
            notes=existing.notes,
            created_at=existing.created_at
        )
    
    # Create new favorite
    favorite = Favorite(
        user_id=current_user.id,
        document_id=favorite_data.document_id,
        notes=favorite_data.notes
    )
    
    db.add(favorite)
    db.commit()
    db.refresh(favorite)
    
    logger.info(f"User {current_user.username} added favorite: {document.name}")
    
    return FavoriteResponse(
        id=favorite.id,
        document_id=favorite.document_id,
        document=DocumentResponse.from_orm(document),
        notes=favorite.notes,
        created_at=favorite.created_at
    )


@router.delete("/favorites/{favorite_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_favorite(
    favorite_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    """Remove a document from user's favorites."""
    favorite = db.query(Favorite).filter(
        Favorite.id == favorite_id,
        Favorite.user_id == current_user.id
    ).first()
    
    if not favorite:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Favorite not found"
        )
    
    db.delete(favorite)
    db.commit()
    
    logger.info(f"User {current_user.username} removed favorite: {favorite_id}")


@router.delete("/favorites/document/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_favorite_by_document(
    document_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    """Remove a document from favorites by document ID."""
    favorite = db.query(Favorite).filter(
        Favorite.document_id == document_id,
        Favorite.user_id == current_user.id
    ).first()
    
    if not favorite:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Favorite not found"
        )
    
    db.delete(favorite)
    db.commit()
    
    logger.info(f"User {current_user.username} removed favorite for document: {document_id}")


@router.get("/favorites/check/{document_id}")
async def check_favorite(
    document_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    """Check if a document is in user's favorites."""
    favorite = db.query(Favorite).filter(
        Favorite.document_id == document_id,
        Favorite.user_id == current_user.id
    ).first()
    
    return {
        "is_favorite": favorite is not None,
        "favorite_id": favorite.id if favorite else None,
        "notes": favorite.notes if favorite else None
    }


@router.get("/search-history", response_model=List[SearchHistoryResponse])
async def get_search_history(
    current_user: CurrentUser,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """Get current user's search history."""
    history = db.query(SearchHistory).filter(
        SearchHistory.user_id == current_user.id
    ).order_by(
        desc(SearchHistory.created_at)
    ).offset(offset).limit(limit).all()
    
    return [SearchHistoryResponse.from_orm(h) for h in history]


@router.post("/search-history")
async def add_search_history(
    query: str = Query(..., min_length=1, max_length=200),
    results_count: int = Query(..., ge=0),
    clicked_result_id: Optional[int] = None,
    current_user: CurrentUser = None,
    db: Session = Depends(get_db)
):
    """Add an entry to user's search history."""
    # Create search history entry
    history_entry = SearchHistory(
        user_id=current_user.id,
        query=query,
        results_count=results_count,
        clicked_result_id=clicked_result_id
    )
    
    db.add(history_entry)
    db.commit()
    
    return {"message": "Search history recorded"}


@router.delete("/search-history", status_code=status.HTTP_204_NO_CONTENT)
async def clear_search_history(
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    """Clear all search history for current user."""
    db.query(SearchHistory).filter(
        SearchHistory.user_id == current_user.id
    ).delete()
    
    db.commit()
    
    logger.info(f"User {current_user.username} cleared search history")


@router.get("/stats")
async def get_user_stats(
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    """Get user statistics."""
    favorites_count = db.query(Favorite).filter(
        Favorite.user_id == current_user.id
    ).count()
    
    search_count = db.query(SearchHistory).filter(
        SearchHistory.user_id == current_user.id
    ).count()
    
    # Get most viewed documents (from favorites)
    most_favorited = db.query(
        Document.name,
        Document.title,
        Document.section
    ).join(
        Favorite
    ).filter(
        Favorite.user_id == current_user.id
    ).limit(5).all()
    
    return {
        "favorites_count": favorites_count,
        "searches_count": search_count,
        "most_favorited": [
            {
                "name": doc.name,
                "title": doc.title,
                "section": doc.section
            }
            for doc in most_favorited
        ],
        "member_since": current_user.created_at.isoformat()
    }