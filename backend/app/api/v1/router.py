from fastapi import APIRouter

from app.api.v1.routes import info

router = APIRouter(prefix="/api/v1")

router.include_router(info.router, tags=["info"])
