from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Query, Request, Response
from fastapi.params import Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.schemas import InfoResponse
from app.datasets.active import get_active_release
from app.datasets.distro import normalize_distro
from app.db.models import ManPage
from app.db.session import get_session
from app.web.http_cache import compute_weak_etag, maybe_not_modified, set_cache_headers

router = APIRouter()


@router.get("/info", response_model=InfoResponse)
async def get_info(
    request: Request,
    response: Response,
    distro: str | None = Query(default=None),
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> InfoResponse | Response:
    distro_norm = normalize_distro(distro)
    active_release = await get_active_release(session, distro=distro_norm)

    if active_release is None:
        return InfoResponse(
            datasetReleaseId="uninitialized",
            locale="en",
            distro=distro_norm,
            pageCount=0,
            lastUpdated=datetime.now(tz=UTC).isoformat(),
        )

    cache_control = "public, max-age=300"
    etag = compute_weak_etag("info", active_release.dataset_release_id)
    not_modified = maybe_not_modified(request, etag=etag, cache_control=cache_control)
    if not_modified is not None:
        return not_modified

    page_count = await session.scalar(
        select(func.count())
        .select_from(ManPage)
        .where(ManPage.dataset_release_id == active_release.id)
    )

    set_cache_headers(response, etag=etag, cache_control=cache_control)
    return InfoResponse(
        datasetReleaseId=active_release.dataset_release_id,
        locale=active_release.locale,
        distro=active_release.distro,
        pageCount=int(page_count or 0),
        lastUpdated=active_release.ingested_at.astimezone(UTC).isoformat(),
    )
