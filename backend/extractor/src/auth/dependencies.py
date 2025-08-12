"""
Authentication dependencies for FastAPI routes.
"""

from typing import Optional, Annotated
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials, APIKeyHeader
from sqlalchemy.orm import Session

from ..db.session import get_db
from ..cache.cache_manager import get_cache_manager
from ..models.user import User, APIKey
from .auth_service import AuthService


# Security schemes
bearer_scheme = HTTPBearer(auto_error=False)
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def get_auth_service(
    db: Session = Depends(get_db)
) -> AuthService:
    """Get authentication service instance."""
    from ..cache.cache_manager import CacheManager
    from ..parser.groff_parser import GroffParser
    cache = CacheManager(db, GroffParser())
    return AuthService(db, cache)


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    auth_service: AuthService = Depends(get_auth_service)
) -> Optional[User]:
    """Get current user if authenticated, None otherwise."""
    if not credentials:
        return None
    
    try:
        return auth_service.get_current_user(credentials.credentials)
    except HTTPException:
        return None


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    auth_service: AuthService = Depends(get_auth_service)
) -> User:
    """Get current authenticated user, raise 401 if not authenticated."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return auth_service.get_current_user(credentials.credentials)


async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """Get current active user."""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )
    return current_user


async def get_current_superuser(
    current_user: User = Depends(get_current_active_user)
) -> User:
    """Get current superuser."""
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    return current_user


async def get_api_key_user(
    api_key: Optional[str] = Depends(api_key_header),
    auth_service: AuthService = Depends(get_auth_service)
) -> Optional[tuple[APIKey, User]]:
    """Get user from API key if provided."""
    if not api_key:
        return None
    
    try:
        return auth_service.verify_api_key(api_key)
    except HTTPException:
        return None


async def require_api_key(
    api_key: str = Depends(api_key_header),
    auth_service: AuthService = Depends(get_auth_service)
) -> tuple[APIKey, User]:
    """Require valid API key."""
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key required",
            headers={"WWW-Authenticate": "ApiKey"},
        )
    
    return auth_service.verify_api_key(api_key)


async def get_current_user_or_api_key(
    bearer_user: Optional[User] = Depends(get_current_user_optional),
    api_key_data: Optional[tuple[APIKey, User]] = Depends(get_api_key_user)
) -> User:
    """Get current user from either Bearer token or API key."""
    if bearer_user:
        return bearer_user
    
    if api_key_data:
        _, user = api_key_data
        return user
    
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required",
        headers={"WWW-Authenticate": "Bearer, ApiKey"},
    )


class RequireScope:
    """Dependency to require specific API scopes."""
    
    def __init__(self, scope: str):
        self.scope = scope
    
    async def __call__(
        self,
        api_key_data: Optional[tuple[APIKey, User]] = Depends(get_api_key_user),
        current_user: Optional[User] = Depends(get_current_user_optional)
    ) -> User:
        # If authenticated with bearer token, allow all scopes
        if current_user:
            return current_user
        
        # If using API key, check scope
        if api_key_data:
            api_key, user = api_key_data
            if api_key.has_scope(self.scope):
                return user
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"API key does not have required scope: {self.scope}"
            )
        
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required"
        )


# Commonly used dependencies
CurrentUser = Annotated[User, Depends(get_current_active_user)]
OptionalUser = Annotated[Optional[User], Depends(get_current_user_optional)]
SuperUser = Annotated[User, Depends(get_current_superuser)]
AuthenticatedUser = Annotated[User, Depends(get_current_user_or_api_key)]