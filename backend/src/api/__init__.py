# backend/src/api/__init__.py
"""API module initialization for BetterMan."""

from fastapi import APIRouter
from .routes import router as main_router
from .search_routes import router as search_router
from .proxy_routes import router as proxy_router
from .user_routes import router as user_router

# Create a main API router that includes all other routers
api_router = APIRouter()

# Include all routers
api_router.include_router(main_router, tags=["documents"])
api_router.include_router(search_router, prefix="/search", tags=["search"])
api_router.include_router(proxy_router, tags=["proxy"])
api_router.include_router(user_router, tags=["user"])
