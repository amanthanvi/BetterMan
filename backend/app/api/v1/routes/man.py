from __future__ import annotations

from fastapi import APIRouter, Request, Response
from fastapi.params import Depends
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import APIError
from app.datasets.active import require_active_release
from app.db.session import get_session
from app.man.normalize import normalize_name, normalize_section, validate_name, validate_section
from app.man.repository import get_page_with_content, list_pages_by_name, list_related_pages
from app.security.deps import rate_limit_page
from app.web.http_cache import compute_weak_etag, maybe_not_modified, set_cache_headers

router = APIRouter()


@router.get("/man/{name}", response_model=None)
async def get_man_by_name(
    request: Request,
    response: Response,
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

    cache_control = "public, max-age=300"

    if len(pages) > 1:
        etag = compute_weak_etag(
            "man-by-name-ambiguous",
            release.dataset_release_id,
            name_norm,
            ",".join(p.section for p in pages),
        )
        not_modified = maybe_not_modified(request, etag=etag, cache_control=cache_control)
        if not_modified is not None:
            return not_modified

        payload = {
            "error": {"code": "AMBIGUOUS_PAGE", "message": "Multiple sections match this name"},
            "options": [
                {
                    "section": page.section,
                    "title": page.title,
                    "description": page.description,
                }
                for page in pages
            ],
        }
        res = JSONResponse(
            status_code=409,
            content=payload,
        )
        set_cache_headers(res, etag=etag, cache_control=cache_control)
        return res

    page = pages[0]
    etag = compute_weak_etag(
        "man-by-name",
        release.dataset_release_id,
        name_norm,
        page.section,
    )
    not_modified = maybe_not_modified(request, etag=etag, cache_control=cache_control)
    if not_modified is not None:
        return not_modified

    page_with_content = await get_page_with_content(
        session, release_id=release.id, name=name_norm, section=page.section
    )
    if page_with_content is None:
        raise APIError(status_code=404, code="PAGE_NOT_FOUND", message="Page not found")

    man_page, content = page_with_content
    content_payload = dict(content.doc)
    content_payload["synopsis"] = content.synopsis
    content_payload["options"] = content.options
    content_payload["seeAlso"] = content.see_also

    set_cache_headers(response, etag=etag, cache_control=cache_control)
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
        "content": content_payload,
    }


@router.get("/man/{name}/{section}")
async def get_man_by_name_and_section(
    request: Request,
    response: Response,
    name: str,
    section: str,
    _: None = Depends(rate_limit_page),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> dict[str, object]:
    name_norm = normalize_name(name)
    validate_name(name_norm)
    section_norm = normalize_section(section)
    validate_section(section_norm)

    release = await require_active_release(session)

    cache_control = "public, max-age=300"
    etag = compute_weak_etag(
        "man-by-name-section",
        release.dataset_release_id,
        name_norm,
        section_norm,
    )
    not_modified = maybe_not_modified(request, etag=etag, cache_control=cache_control)
    if not_modified is not None:
        return not_modified

    page_with_content = await get_page_with_content(
        session, release_id=release.id, name=name_norm, section=section_norm
    )

    if page_with_content is None:
        raise APIError(status_code=404, code="PAGE_NOT_FOUND", message="Page not found")

    man_page, content = page_with_content
    content_payload = dict(content.doc)
    content_payload["synopsis"] = content.synopsis
    content_payload["options"] = content.options
    content_payload["seeAlso"] = content.see_also

    set_cache_headers(response, etag=etag, cache_control=cache_control)
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
        "content": content_payload,
    }


@router.get("/man/{name}/{section}/related")
async def get_related(
    request: Request,
    response: Response,
    name: str,
    section: str,
    _: None = Depends(rate_limit_page),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> dict[str, object]:
    name_norm = normalize_name(name)
    validate_name(name_norm)
    section_norm = normalize_section(section)
    validate_section(section_norm)

    release = await require_active_release(session)
    cache_control = "public, max-age=300"
    etag = compute_weak_etag(
        "related",
        release.dataset_release_id,
        name_norm,
        section_norm,
    )
    not_modified = maybe_not_modified(request, etag=etag, cache_control=cache_control)
    if not_modified is not None:
        return not_modified

    page_with_content = await get_page_with_content(
        session, release_id=release.id, name=name_norm, section=section_norm
    )

    if page_with_content is None:
        raise APIError(status_code=404, code="PAGE_NOT_FOUND", message="Page not found")

    man_page, _content = page_with_content
    related_pages = await list_related_pages(session, from_page_id=man_page.id)

    set_cache_headers(response, etag=etag, cache_control=cache_control)
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
