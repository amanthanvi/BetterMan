from fastapi import APIRouter

from app.api.v1.routes import info, sections

router = APIRouter(prefix="/api/v1")

router.include_router(info.router, tags=["info"])
router.include_router(sections.router, tags=["sections"])
