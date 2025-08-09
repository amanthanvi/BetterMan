"""
Authentication API routes.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.orm import Session
from typing import List, Optional

from ..db.session import get_db
from ..cache.cache_manager import get_cache_manager
from .auth_service import AuthService, UserCreate, UserLogin, TokenResponse
from .dependencies import CurrentUser, SuperUser, get_auth_service, bearer_scheme
from ..models.user import User, APIKey
from pydantic import BaseModel, EmailStr
from datetime import datetime


router = APIRouter(prefix="/auth", tags=["authentication"])


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: Optional[str]
    is_active: bool
    is_verified: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


class UserProfile(BaseModel):
    username: str
    email: str
    full_name: Optional[str]
    bio: Optional[str]
    avatar_url: Optional[str]
    is_verified: bool
    created_at: datetime
    favorites_count: int
    search_history_count: int
    
    class Config:
        from_attributes = True


class UpdateProfile(BaseModel):
    full_name: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None


class ChangePassword(BaseModel):
    current_password: str
    new_password: str


class APIKeyCreate(BaseModel):
    name: str
    scopes: Optional[List[str]] = None
    expires_in_days: Optional[int] = None


class APIKeyResponse(BaseModel):
    id: int
    key: str
    name: str
    scopes: Optional[str]
    created_at: datetime
    expires_at: Optional[datetime]
    last_used: Optional[datetime]
    usage_count: int
    
    class Config:
        from_attributes = True


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    user_data: UserCreate,
    auth_service: AuthService = Depends(get_auth_service)
):
    """Register a new user."""
    user = auth_service.create_user(user_data)
    return UserResponse.from_orm(user)


@router.post("/login", response_model=TokenResponse)
async def login(
    credentials: UserLogin,
    response: Response,
    auth_service: AuthService = Depends(get_auth_service)
):
    """Login and receive access tokens."""
    user, tokens = auth_service.authenticate_user(credentials)
    
    # Set secure HTTP-only cookie for refresh token
    response.set_cookie(
        key="refresh_token",
        value=tokens.refresh_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=7 * 24 * 60 * 60  # 7 days
    )
    
    return tokens


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    refresh_token: str,
    auth_service: AuthService = Depends(get_auth_service)
):
    """Refresh access token using refresh token."""
    return auth_service.refresh_access_token(refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    current_user: CurrentUser,
    credentials = Depends(bearer_scheme),
    auth_service: AuthService = Depends(get_auth_service)
):
    """Logout current user."""
    auth_service.logout(credentials.credentials, current_user)
    
    # Clear refresh token cookie
    response.delete_cookie("refresh_token")
    
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UserProfile)
async def get_profile(
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    """Get current user profile."""
    # Count favorites and search history
    favorites_count = len(current_user.favorites)
    search_history_count = len(current_user.search_history)
    
    return UserProfile(
        username=current_user.username,
        email=current_user.email,
        full_name=current_user.full_name,
        bio=current_user.bio,
        avatar_url=current_user.avatar_url,
        is_verified=current_user.is_verified,
        created_at=current_user.created_at,
        favorites_count=favorites_count,
        search_history_count=search_history_count
    )


@router.patch("/me", response_model=UserProfile)
async def update_profile(
    profile_data: UpdateProfile,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    """Update current user profile."""
    if profile_data.full_name is not None:
        current_user.full_name = profile_data.full_name
    if profile_data.bio is not None:
        current_user.bio = profile_data.bio
    if profile_data.avatar_url is not None:
        current_user.avatar_url = profile_data.avatar_url
    
    db.commit()
    db.refresh(current_user)
    
    return await get_profile(current_user, db)


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    password_data: ChangePassword,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    """Change current user password."""
    if not current_user.verify_password(password_data.current_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )
    
    # Validate new password
    try:
        UserCreate.validate_password(password_data.new_password)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    
    current_user.set_password(password_data.new_password)
    db.commit()
    
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/api-keys", response_model=APIKeyResponse, status_code=status.HTTP_201_CREATED)
async def create_api_key(
    key_data: APIKeyCreate,
    current_user: CurrentUser,
    auth_service: AuthService = Depends(get_auth_service)
):
    """Create a new API key."""
    api_key = auth_service.create_api_key(
        current_user,
        key_data.name,
        key_data.scopes
    )
    
    if key_data.expires_in_days:
        from datetime import timedelta
        api_key.expires_at = datetime.utcnow() + timedelta(days=key_data.expires_in_days)
        auth_service.db.commit()
    
    return APIKeyResponse.from_orm(api_key)


@router.get("/api-keys", response_model=List[APIKeyResponse])
async def list_api_keys(
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    """List current user's API keys."""
    # Don't return the actual key value for security
    keys = []
    for key in current_user.api_keys:
        key_dict = {
            "id": key.id,
            "key": key.key[:10] + "..." + key.key[-4:],  # Partial key
            "name": key.name,
            "scopes": key.scopes,
            "created_at": key.created_at,
            "expires_at": key.expires_at,
            "last_used": key.last_used,
            "usage_count": key.usage_count
        }
        keys.append(APIKeyResponse(**key_dict))
    
    return keys


@router.delete("/api-keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_api_key(
    key_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    """Revoke an API key."""
    api_key = db.query(APIKey).filter(
        APIKey.id == key_id,
        APIKey.user_id == current_user.id
    ).first()
    
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found"
        )
    
    api_key.is_active = False
    api_key.revoked_at = datetime.utcnow()
    db.commit()
    
    # Clear from cache
    cache = get_cache_manager(db)
    if hasattr(cache, 'redis_cache') and cache.redis_cache:
        cache.redis_cache.delete(f"api_key:{api_key.key}")
    
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/users", response_model=List[UserResponse])
async def list_users(
    current_user: SuperUser,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """List all users (admin only)."""
    users = db.query(User).offset(skip).limit(limit).all()
    return [UserResponse.from_orm(user) for user in users]


@router.patch("/users/{user_id}/activate", response_model=UserResponse)
async def activate_user(
    user_id: int,
    current_user: SuperUser,
    db: Session = Depends(get_db)
):
    """Activate a user account (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    user.is_active = True
    db.commit()
    db.refresh(user)
    
    return UserResponse.from_orm(user)


@router.patch("/users/{user_id}/deactivate", response_model=UserResponse)
async def deactivate_user(
    user_id: int,
    current_user: SuperUser,
    db: Session = Depends(get_db)
):
    """Deactivate a user account (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate your own account"
        )
    
    user.is_active = False
    db.commit()
    db.refresh(user)
    
    return UserResponse.from_orm(user)


from typing import Optional