"""
Authentication module for BetterMan.
"""

from fastapi import APIRouter
from .auth_service import AuthService, UserCreate, UserLogin, TokenResponse
from .dependencies import (
    CurrentUser,
    OptionalUser,
    SuperUser,
    AuthenticatedUser,
    get_current_user,
    get_current_user_optional,
    get_current_active_user,
    get_current_superuser,
    get_current_user_or_api_key,
    require_api_key,
    RequireScope
)
from .routes import router as base_auth_router
from .oauth_routes import router as oauth_router

# Create parent auth router
auth_router = APIRouter()

# Include both auth routes and oauth routes
auth_router.include_router(base_auth_router)
auth_router.include_router(oauth_router)

__all__ = [
    "AuthService",
    "UserCreate",
    "UserLogin",
    "TokenResponse",
    "CurrentUser",
    "OptionalUser",
    "SuperUser",
    "AuthenticatedUser",
    "get_current_user",
    "get_current_user_optional",
    "get_current_active_user",
    "get_current_superuser",
    "get_current_user_or_api_key",
    "require_api_key",
    "RequireScope",
    "auth_router"
]