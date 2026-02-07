from fastapi import APIRouter

from app.api.v1.routes import info, licenses, man, search, sections, seo_data, suggest

router = APIRouter(prefix="/api/v1")

router.include_router(info.router, tags=["info"])
router.include_router(search.router, tags=["search"])
router.include_router(suggest.router, tags=["suggest"])
router.include_router(man.router, tags=["man"])
router.include_router(sections.router, tags=["sections"])
router.include_router(licenses.router, tags=["licenses"])
router.include_router(seo_data.router, tags=["seo"])
