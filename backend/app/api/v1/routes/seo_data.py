from __future__ import annotations

from fastapi import APIRouter, Query, Request, Response
from fastapi.params import Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.schemas import SeoReleasesResponse, SeoSitemapPageResponse
from app.datasets.active import get_active_release
from app.datasets.distro import SUPPORTED_DISTROS, normalize_distro
from app.db.models import ManPage
from app.db.session import get_session
from app.web.http_cache import compute_weak_etag, maybe_not_modified, set_cache_headers

router = APIRouter()

SITEMAP_URLS_PER_FILE = 10_000


@router.get("/seo/releases", include_in_schema=False, response_model=SeoReleasesResponse)
async def list_seo_releases(
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> SeoReleasesResponse | Response:
    cache_control = "public, max-age=3600"

    items: list[dict[str, object]] = []
    etag_parts: list[str] = ["seo-releases", str(SITEMAP_URLS_PER_FILE)]

    for distro in sorted(SUPPORTED_DISTROS):
        release = await get_active_release(session, distro=distro)
        if release is None:
            continue

        total = await session.scalar(
            select(func.count())
            .select_from(ManPage)
            .where(ManPage.dataset_release_id == release.id)
        )
        page_count = int(total or 0)

        items.append(
            {
                "distro": distro,
                "datasetReleaseId": release.dataset_release_id,
                "ingestedAt": release.ingested_at.isoformat(),
                "pageCount": page_count,
            }
        )

        etag_parts.append(distro)
        etag_parts.append(release.dataset_release_id)
        etag_parts.append(str(page_count))

    etag = compute_weak_etag(*etag_parts)
    not_modified = maybe_not_modified(request, etag=etag, cache_control=cache_control)
    if not_modified is not None:
        return not_modified

    set_cache_headers(response, etag=etag, cache_control=cache_control)
    return {"urlsPerFile": SITEMAP_URLS_PER_FILE, "items": items}


@router.get("/seo/sitemap-page", include_in_schema=False, response_model=SeoSitemapPageResponse)
async def list_sitemap_page_items(
    request: Request,
    response: Response,
    distro: str = Query(min_length=1, max_length=50),
    page: int = Query(ge=1),
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> SeoSitemapPageResponse | Response:
    distro_norm = normalize_distro(distro)
    release = await get_active_release(session, distro=distro_norm)
    if release is None:
        return Response(status_code=404)

    cache_control = "public, max-age=3600"
    etag = compute_weak_etag("seo-sitemap-page", distro_norm, release.dataset_release_id, str(page))
    not_modified = maybe_not_modified(request, etag=etag, cache_control=cache_control)
    if not_modified is not None:
        return not_modified

    offset = (page - 1) * SITEMAP_URLS_PER_FILE
    rows = await session.execute(
        select(ManPage.name, ManPage.section)
        .where(ManPage.dataset_release_id == release.id)
        .order_by(ManPage.name.asc(), ManPage.section.asc())
        .limit(SITEMAP_URLS_PER_FILE)
        .offset(offset)
    )

    raw_items = rows.all()
    if not raw_items:
        return Response(status_code=404)

    items: list[dict[str, str]] = []
    for name, section in raw_items:
        if not isinstance(name, str) or not name:
            continue
        if not isinstance(section, str) or not section:
            continue
        items.append({"name": name, "section": section})

    if not items:
        return Response(status_code=404)

    set_cache_headers(response, etag=etag, cache_control=cache_control)
    return {
        "items": items,
        "page": page,
    }
