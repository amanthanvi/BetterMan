# backend/src/api/__init__.py
"""API module initialization for BetterMan."""

from fastapi import APIRouter
from .routes import router as main_router
from .search_routes import router as search_router

# Create a main API router that includes all other routers
api_router = APIRouter()

# Include all routers
api_router.include_router(main_router, tags=["documents"])
api_router.include_router(search_router, prefix="/search", tags=["search"])
