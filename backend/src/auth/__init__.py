"""
Authentication module for BetterMan.
"""

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
from .routes import router as auth_router

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