# backend/src/api/__init__.py
"""API module initialization for BetterMan."""

from fastapi import APIRouter
from .routes import router as main_router
from .search_routes import router as search_router
from .proxy_routes import router as proxy_router
from .user_routes import router as user_router
from .error_routes import router as error_router
from .terminal_routes import router as terminal_router
from .personalization_routes import router as personalization_router
from .admin_routes import router as admin_router
from .man_routes import router as man_router  # New man pages router

# Create a main API router that includes all other routers
api_router = APIRouter()

# Include all routers
api_router.include_router(main_router, tags=["documents"])
api_router.include_router(search_router, prefix="/search", tags=["search"])
api_router.include_router(man_router, tags=["man-pages"])  # Add man pages routes
api_router.include_router(proxy_router, tags=["proxy"])
api_router.include_router(user_router, tags=["user"])
api_router.include_router(error_router, tags=["errors"])
api_router.include_router(terminal_router, tags=["terminal"])
api_router.include_router(personalization_router, tags=["personalization"])
api_router.include_router(admin_router, tags=["admin"])
