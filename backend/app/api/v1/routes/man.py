from __future__ import annotations

from fastapi import APIRouter, Query, Request, Response
from fastapi.params import Depends
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.schemas import (
    AmbiguousPageResponse,
    ManPageMetaResponse,
    ManPageResponse,
    RelatedResponse,
)
from app.core.errors import APIError
from app.datasets.active import require_active_release
from app.datasets.distro import DISTRO_ORDER_INDEX, normalize_distro
from app.db.models import DatasetRelease, ManPage
from app.db.session import get_session
from app.man.normalize import (
    normalize_name,
    normalize_section,
    validate_name,
    validate_section,
)
from app.man.repository import (
    get_page,
    get_page_with_content,
    list_pages_by_name,
    list_related_pages,
)
from app.security.deps import rate_limit_page
from app.web.http_cache import compute_weak_etag, maybe_not_modified, set_cache_headers
from app.web.server_timing import attach_server_timing, elapsed_ms, mark

router = APIRouter()


@router.get(
    "/man/{name}",
    response_model=ManPageResponse,
    responses={409: {"model": AmbiguousPageResponse}},
)
async def get_man_by_name(
    request: Request,
    response: Response,
    name: str,
    distro: str | None = Query(default=None),
    _: None = Depends(rate_limit_page),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> ManPageResponse | AmbiguousPageResponse | Response:
    server_timing = _server_timing_seed(request)
    name_norm = normalize_name(name)
    validate_name(name_norm)

    distro_norm = normalize_distro(distro)
    release_started = mark()
    release = await require_active_release(session, distro=distro_norm)
    server_timing.append(("active_release", elapsed_ms(release_started)))
    pages_started = mark()
    pages = await list_pages_by_name(session, release_id=release.id, name=name_norm)
    server_timing.append(("lookup_pages", elapsed_ms(pages_started)))

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
            attach_server_timing(not_modified, server_timing)
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
        attach_server_timing(res, server_timing)
        return res

    page = pages[0]
    page_content_started = mark()
    page_with_content = await get_page_with_content(
        session, release_id=release.id, name=name_norm, section=page.section
    )
    server_timing.append(("load_page_content", elapsed_ms(page_content_started)))
    if page_with_content is None:
        raise APIError(status_code=404, code="PAGE_NOT_FOUND", message="Page not found")

    man_page, content = page_with_content
    variants_started = mark()
    variants = await _list_page_variants(
        session,
        locale=release.locale,
        name=man_page.name,
        section=man_page.section,
    )
    server_timing.append(("load_variants", elapsed_ms(variants_started)))
    variants_etag = _variants_etag_key(variants)
    etag = compute_weak_etag(
        "man-by-name",
        release.dataset_release_id,
        man_page.content_sha256,
        variants_etag,
    )
    not_modified = maybe_not_modified(request, etag=etag, cache_control=cache_control)
    if not_modified is not None:
        attach_server_timing(not_modified, server_timing)
        return not_modified

    content_payload = dict(content.doc)
    content_payload["synopsis"] = content.synopsis
    content_payload["options"] = content.options
    content_payload["seeAlso"] = content.see_also

    set_cache_headers(response, etag=etag, cache_control=cache_control)
    attach_server_timing(response, server_timing)
    return {
        "page": _serialize_page(man_page, release),
        "content": content_payload,
        "variants": variants,
    }


@router.get("/man/{name}/{section}", response_model=ManPageResponse)
async def get_man_by_name_and_section(
    request: Request,
    response: Response,
    name: str,
    section: str,
    distro: str | None = Query(default=None),
    _: None = Depends(rate_limit_page),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> ManPageResponse | Response:
    server_timing = _server_timing_seed(request)
    name_norm = normalize_name(name)
    validate_name(name_norm)
    section_norm = normalize_section(section)
    validate_section(section_norm)

    distro_norm = normalize_distro(distro)
    release_started = mark()
    release = await require_active_release(session, distro=distro_norm)
    server_timing.append(("active_release", elapsed_ms(release_started)))

    cache_control = "public, max-age=300"
    page_content_started = mark()
    page_with_content = await get_page_with_content(
        session, release_id=release.id, name=name_norm, section=section_norm
    )
    server_timing.append(("load_page_content", elapsed_ms(page_content_started)))

    if page_with_content is None:
        raise APIError(status_code=404, code="PAGE_NOT_FOUND", message="Page not found")

    man_page, content = page_with_content
    variants_started = mark()
    variants = await _list_page_variants(
        session,
        locale=release.locale,
        name=man_page.name,
        section=man_page.section,
    )
    server_timing.append(("load_variants", elapsed_ms(variants_started)))
    variants_etag = _variants_etag_key(variants)
    etag = compute_weak_etag(
        "man-by-name-section",
        release.dataset_release_id,
        man_page.content_sha256,
        variants_etag,
    )
    not_modified = maybe_not_modified(request, etag=etag, cache_control=cache_control)
    if not_modified is not None:
        attach_server_timing(not_modified, server_timing)
        return not_modified

    content_payload = dict(content.doc)
    content_payload["synopsis"] = content.synopsis
    content_payload["options"] = content.options
    content_payload["seeAlso"] = content.see_also

    set_cache_headers(response, etag=etag, cache_control=cache_control)
    attach_server_timing(response, server_timing)
    return {
        "page": _serialize_page(man_page, release),
        "content": content_payload,
        "variants": variants,
    }


@router.get("/man/{name}/{section}/meta", response_model=ManPageMetaResponse)
async def get_man_meta_by_name_and_section(
    request: Request,
    response: Response,
    name: str,
    section: str,
    distro: str | None = Query(default=None),
    _: None = Depends(rate_limit_page),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> ManPageMetaResponse | Response:
    server_timing = _server_timing_seed(request)
    name_norm = normalize_name(name)
    validate_name(name_norm)
    section_norm = normalize_section(section)
    validate_section(section_norm)

    distro_norm = normalize_distro(distro)
    release_started = mark()
    release = await require_active_release(session, distro=distro_norm)
    server_timing.append(("active_release", elapsed_ms(release_started)))

    cache_control = "public, max-age=300"
    page_started = mark()
    man_page = await get_page(session, release_id=release.id, name=name_norm, section=section_norm)
    server_timing.append(("lookup_page", elapsed_ms(page_started)))

    if man_page is None:
        raise APIError(status_code=404, code="PAGE_NOT_FOUND", message="Page not found")

    etag = compute_weak_etag(
        "man-by-name-section-meta",
        release.dataset_release_id,
        man_page.content_sha256,
    )
    not_modified = maybe_not_modified(request, etag=etag, cache_control=cache_control)
    if not_modified is not None:
        attach_server_timing(not_modified, server_timing)
        return not_modified

    set_cache_headers(response, etag=etag, cache_control=cache_control)
    attach_server_timing(response, server_timing)
    return {
        "page": _serialize_page(man_page, release),
    }


@router.get("/man/{name}/{section}/related", response_model=RelatedResponse)
async def get_related(
    request: Request,
    response: Response,
    name: str,
    section: str,
    distro: str | None = Query(default=None),
    _: None = Depends(rate_limit_page),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> RelatedResponse | Response:
    server_timing = _server_timing_seed(request)
    name_norm = normalize_name(name)
    validate_name(name_norm)
    section_norm = normalize_section(section)
    validate_section(section_norm)

    distro_norm = normalize_distro(distro)
    release_started = mark()
    release = await require_active_release(session, distro=distro_norm)
    server_timing.append(("active_release", elapsed_ms(release_started)))
    cache_control = "public, max-age=300"
    etag = compute_weak_etag(
        "related",
        release.dataset_release_id,
        name_norm,
        section_norm,
    )
    not_modified = maybe_not_modified(request, etag=etag, cache_control=cache_control)
    if not_modified is not None:
        attach_server_timing(not_modified, server_timing)
        return not_modified

    page_started = mark()
    page_with_content = await get_page_with_content(
        session, release_id=release.id, name=name_norm, section=section_norm
    )
    server_timing.append(("lookup_page", elapsed_ms(page_started)))

    if page_with_content is None:
        raise APIError(status_code=404, code="PAGE_NOT_FOUND", message="Page not found")

    man_page, _content = page_with_content
    related_started = mark()
    related_pages = await list_related_pages(session, from_page_id=man_page.id)
    server_timing.append(("load_related", elapsed_ms(related_started)))

    set_cache_headers(response, etag=etag, cache_control=cache_control)
    attach_server_timing(response, server_timing)
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


async def _list_page_variants(
    session: AsyncSession,
    *,
    locale: str,
    name: str,
    section: str,
) -> list[dict[str, str]]:
    rows = (
        await session.execute(
            select(
                DatasetRelease.distro,
                DatasetRelease.dataset_release_id,
                ManPage.content_sha256,
            )
            .join(ManPage, ManPage.dataset_release_id == DatasetRelease.id)
            .where(DatasetRelease.is_active)
            .where(DatasetRelease.locale == locale)
            .where(ManPage.name == name)
            .where(ManPage.section == section)
        )
    ).all()

    variants = [
        {
            "distro": row.distro,
            "datasetReleaseId": row.dataset_release_id,
            "contentSha256": row.content_sha256,
        }
        for row in rows
        if isinstance(row.distro, str)
        and isinstance(row.dataset_release_id, str)
        and isinstance(row.content_sha256, str)
    ]

    variants.sort(key=lambda v: (DISTRO_ORDER_INDEX.get(v["distro"], 99), v["distro"]))
    return variants


def _variants_etag_key(variants: list[dict[str, str]]) -> str:
    return ",".join(
        f"{v.get('distro', '')}:{v.get('datasetReleaseId', '')}:{v.get('contentSha256', '')}"
        for v in variants
    )


def _serialize_page(man_page: ManPage, release: DatasetRelease) -> dict[str, str | None]:
    return {
        "id": str(man_page.id),
        "locale": release.locale,
        "distro": release.distro,
        "name": man_page.name,
        "section": man_page.section,
        "title": man_page.title,
        "description": man_page.description,
        "sourcePackage": man_page.source_package,
        "sourcePackageVersion": man_page.source_package_version,
        "datasetReleaseId": release.dataset_release_id,
    }


def _server_timing_seed(request: Request) -> list[tuple[str, float]]:
    rate_limit_ms = getattr(request.state, "rate_limit_ms", None)
    if isinstance(rate_limit_ms, (int, float)):
        return [("rate_limit", float(rate_limit_ms))]
    return []
