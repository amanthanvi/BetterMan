from __future__ import annotations

from fastapi import APIRouter
from fastapi.params import Depends
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import APIError
from app.datasets.active import require_active_release
from app.db.session import get_session
from app.man.normalize import normalize_name, validate_name, validate_section
from app.man.repository import get_page_with_content, list_pages_by_name, list_related_pages
from app.security.deps import rate_limit_page

router = APIRouter()


@router.get("/man/{name}", response_model=None)
async def get_man_by_name(
    name: str,
    _: None = Depends(rate_limit_page),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
):
    name_norm = normalize_name(name)
    validate_name(name_norm)

    release = await require_active_release(session)
    pages = await list_pages_by_name(session, release_id=release.id, name=name_norm)

    if not pages:
        raise APIError(status_code=404, code="PAGE_NOT_FOUND", message="Page not found")

    if len(pages) > 1:
        return JSONResponse(
            status_code=409,
            content={
                "error": {"code": "AMBIGUOUS_PAGE", "message": "Multiple sections match this name"},
                "options": [
                    {
                        "section": page.section,
                        "title": page.title,
                        "description": page.description,
                    }
                    for page in pages
                ],
            },
        )

    page = pages[0]
    page_with_content = await get_page_with_content(
        session, release_id=release.id, name=name_norm, section=page.section
    )
    if page_with_content is None:
        raise APIError(status_code=404, code="PAGE_NOT_FOUND", message="Page not found")

    man_page, content = page_with_content
    return {
        "page": {
            "id": str(man_page.id),
            "locale": release.locale,
            "name": man_page.name,
            "section": man_page.section,
            "title": man_page.title,
            "description": man_page.description,
            "sourcePackage": man_page.source_package,
            "sourcePackageVersion": man_page.source_package_version,
            "datasetReleaseId": release.dataset_release_id,
        },
        "content": content.doc,
    }


@router.get("/man/{name}/{section}")
async def get_man_by_name_and_section(
    name: str,
    section: str,
    _: None = Depends(rate_limit_page),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> dict[str, object]:
    name_norm = normalize_name(name)
    validate_name(name_norm)
    validate_section(section)

    release = await require_active_release(session)
    page_with_content = await get_page_with_content(
        session, release_id=release.id, name=name_norm, section=section
    )

    if page_with_content is None:
        raise APIError(status_code=404, code="PAGE_NOT_FOUND", message="Page not found")

    man_page, content = page_with_content
    return {
        "page": {
            "id": str(man_page.id),
            "locale": release.locale,
            "name": man_page.name,
            "section": man_page.section,
            "title": man_page.title,
            "description": man_page.description,
            "sourcePackage": man_page.source_package,
            "sourcePackageVersion": man_page.source_package_version,
            "datasetReleaseId": release.dataset_release_id,
        },
        "content": content.doc,
    }


@router.get("/man/{name}/{section}/related")
async def get_related(
    name: str,
    section: str,
    _: None = Depends(rate_limit_page),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> dict[str, object]:
    name_norm = normalize_name(name)
    validate_name(name_norm)
    validate_section(section)

    release = await require_active_release(session)
    page_with_content = await get_page_with_content(
        session, release_id=release.id, name=name_norm, section=section
    )

    if page_with_content is None:
        raise APIError(status_code=404, code="PAGE_NOT_FOUND", message="Page not found")

    man_page, _content = page_with_content
    related_pages = await list_related_pages(session, from_page_id=man_page.id)

    return {
        "items": [
            {
                "name": page.name,
                "section": page.section,
                "title": page.title,
                "description": page.description,
            }
            for page in related_pages
        ]
    }
