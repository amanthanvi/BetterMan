"""
Personalization API routes.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel
import json

from ..db.session import get_db
from ..auth.dependencies import CurrentUser
from ..services.personalization_service import PersonalizationService
from ..models.oauth import UserPreferences, UserCollection, LearningProgress, CommandSnippet
from ..models.document import Document, DocumentResponse

router = APIRouter(prefix="/personalization", tags=["personalization"])


class PreferencesUpdate(BaseModel):
    """User preferences update model."""
    theme: Optional[str] = None
    language: Optional[str] = None
    timezone: Optional[str] = None
    keyboard_shortcuts: Optional[Dict[str, str]] = None
    font_size: Optional[str] = None
    line_height: Optional[str] = None
    code_theme: Optional[str] = None
    enable_animations: Optional[bool] = None
    enable_sounds: Optional[bool] = None
    enable_notifications: Optional[bool] = None
    show_profile_publicly: Optional[bool] = None
    share_statistics: Optional[bool] = None


class PreferencesResponse(BaseModel):
    """User preferences response."""
    theme: str
    language: str
    timezone: str
    keyboard_shortcuts: Optional[Dict[str, str]]
    font_size: str
    line_height: str
    code_theme: str
    enable_animations: bool
    enable_sounds: bool
    enable_notifications: bool
    show_profile_publicly: bool
    share_statistics: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class CollectionCreate(BaseModel):
    """Collection creation model."""
    name: str
    description: Optional[str] = None
    is_public: bool = False


class CollectionResponse(BaseModel):
    """Collection response model."""
    id: int
    name: str
    description: Optional[str]
    is_public: bool
    is_featured: bool
    items_count: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class SnippetCreate(BaseModel):
    """Snippet creation model."""
    title: str
    command: str
    description: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    is_public: bool = False


class SnippetResponse(BaseModel):
    """Snippet response model."""
    id: int
    title: str
    command: str
    description: Optional[str]
    category: Optional[str]
    tags: Optional[List[str]]
    is_public: bool
    usage_count: int
    last_used: Optional[datetime]
    created_at: datetime
    
    class Config:
        from_attributes = True


class LearningProgressResponse(BaseModel):
    """Learning progress response."""
    documents_viewed: int
    commands_learned: int
    time_spent_minutes: int
    current_streak: int
    longest_streak: int
    last_activity_date: Optional[datetime]
    achievements: List[Dict[str, Any]]
    achievement_points: int
    completed_paths: List[str]
    
    class Config:
        from_attributes = True


class AchievementResponse(BaseModel):
    """Achievement response."""
    id: str
    name: str
    description: str
    points: int
    earned_at: datetime


@router.get("/preferences", response_model=PreferencesResponse)
async def get_preferences(
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    """Get user preferences."""
    service = PersonalizationService(db)
    prefs = service.get_or_create_preferences(current_user)
    
    response = PreferencesResponse.from_orm(prefs)
    
    # Parse keyboard shortcuts from JSON
    if prefs.keyboard_shortcuts:
        response.keyboard_shortcuts = json.loads(prefs.keyboard_shortcuts)
    
    return response


@router.patch("/preferences", response_model=PreferencesResponse)
async def update_preferences(
    preferences: PreferencesUpdate,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    """Update user preferences."""
    service = PersonalizationService(db)
    
    # Convert to dict and remove None values
    prefs_dict = preferences.dict(exclude_none=True)
    
    prefs = service.update_preferences(current_user, prefs_dict)
    
    response = PreferencesResponse.from_orm(prefs)
    
    # Parse keyboard shortcuts from JSON
    if prefs.keyboard_shortcuts:
        response.keyboard_shortcuts = json.loads(prefs.keyboard_shortcuts)
    
    return response


@router.get("/recommendations", response_model=List[DocumentResponse])
async def get_recommendations(
    current_user: CurrentUser,
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db)
):
    """Get personalized document recommendations."""
    service = PersonalizationService(db)
    
    recommendations = service.get_recommendations(current_user, limit)
    
    return [DocumentResponse.from_orm(doc) for doc in recommendations]


@router.get("/learning-progress", response_model=LearningProgressResponse)
async def get_learning_progress(
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    """Get user's learning progress."""
    service = PersonalizationService(db)
    progress = service.get_or_create_learning_progress(current_user)
    
    response = LearningProgressResponse.from_orm(progress)
    
    # Parse JSON fields
    if progress.achievements:
        achievements_dict = json.loads(progress.achievements)
        response.achievements = list(achievements_dict.values())
    else:
        response.achievements = []
    
    if progress.completed_paths:
        response.completed_paths = json.loads(progress.completed_paths)
    else:
        response.completed_paths = []
    
    return response


@router.get("/achievements", response_model=List[AchievementResponse])
async def get_achievements(
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    """Get user's achievements."""
    service = PersonalizationService(db)
    progress = service.get_or_create_learning_progress(current_user)
    
    if progress.achievements:
        achievements_dict = json.loads(progress.achievements)
        return [
            AchievementResponse(**achievement)
            for achievement in achievements_dict.values()
        ]
    
    return []


# Collections

@router.get("/collections", response_model=List[CollectionResponse])
async def get_collections(
    current_user: CurrentUser,
    include_public: bool = Query(False),
    db: Session = Depends(get_db)
):
    """Get user's collections."""
    q = db.query(UserCollection)
    
    if include_public:
        q = q.filter(
            (UserCollection.user_id == current_user.id) |
            (UserCollection.is_public == True)
        )
    else:
        q = q.filter(UserCollection.user_id == current_user.id)
    
    collections = q.all()
    
    responses = []
    for collection in collections:
        items = json.loads(collection.items)
        responses.append(CollectionResponse(
            id=collection.id,
            name=collection.name,
            description=collection.description,
            is_public=collection.is_public,
            is_featured=collection.is_featured,
            items_count=len(items),
            created_at=collection.created_at,
            updated_at=collection.updated_at
        ))
    
    return responses


@router.post("/collections", response_model=CollectionResponse, status_code=status.HTTP_201_CREATED)
async def create_collection(
    collection_data: CollectionCreate,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    """Create a new collection."""
    service = PersonalizationService(db)
    
    collection = service.create_collection(
        current_user,
        collection_data.name,
        collection_data.description,
        collection_data.is_public
    )
    
    return CollectionResponse(
        id=collection.id,
        name=collection.name,
        description=collection.description,
        is_public=collection.is_public,
        is_featured=collection.is_featured,
        items_count=0,
        created_at=collection.created_at,
        updated_at=collection.updated_at
    )


@router.post("/collections/{collection_id}/items")
async def add_to_collection(
    collection_id: int,
    document_id: int = Query(...),
    current_user: CurrentUser = None,
    db: Session = Depends(get_db)
):
    """Add document to collection."""
    service = PersonalizationService(db)
    
    # Verify document exists
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    
    try:
        collection = service.add_to_collection(
            current_user, collection_id, document_id
        )
        
        items = json.loads(collection.items)
        
        return {
            "message": "Document added to collection",
            "items_count": len(items)
        }
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )


@router.get("/collections/{collection_id}/items", response_model=List[DocumentResponse])
async def get_collection_items(
    collection_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    """Get documents in a collection."""
    collection = db.query(UserCollection).filter(
        UserCollection.id == collection_id
    ).first()
    
    if not collection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Collection not found"
        )
    
    # Check access
    if not collection.is_public and collection.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    # Get documents
    items = json.loads(collection.items)
    documents = db.query(Document).filter(Document.id.in_(items)).all()
    
    return [DocumentResponse.from_orm(doc) for doc in documents]


# Snippets

@router.get("/snippets", response_model=List[SnippetResponse])
async def get_snippets(
    current_user: CurrentUser,
    query: Optional[str] = None,
    category: Optional[str] = None,
    include_public: bool = Query(True),
    db: Session = Depends(get_db)
):
    """Search command snippets."""
    service = PersonalizationService(db)
    
    snippets = service.search_snippets(
        current_user, query, category, include_public
    )
    
    responses = []
    for snippet in snippets:
        response = SnippetResponse.from_orm(snippet)
        if snippet.tags:
            response.tags = json.loads(snippet.tags)
        responses.append(response)
    
    return responses


@router.post("/snippets", response_model=SnippetResponse, status_code=status.HTTP_201_CREATED)
async def create_snippet(
    snippet_data: SnippetCreate,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    """Create a command snippet."""
    service = PersonalizationService(db)
    
    snippet = service.create_snippet(
        current_user,
        snippet_data.title,
        snippet_data.command,
        snippet_data.description,
        snippet_data.category,
        snippet_data.tags,
        snippet_data.is_public
    )
    
    response = SnippetResponse.from_orm(snippet)
    if snippet.tags:
        response.tags = json.loads(snippet.tags)
    
    return response


@router.post("/snippets/{snippet_id}/use")
async def use_snippet(
    snippet_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    """Track snippet usage."""
    service = PersonalizationService(db)
    
    snippet = db.query(CommandSnippet).filter(
        CommandSnippet.id == snippet_id
    ).first()
    
    if not snippet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Snippet not found"
        )
    
    # Check access
    if not snippet.is_public and snippet.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    service.use_snippet(snippet)
    
    return {"message": "Snippet usage tracked"}