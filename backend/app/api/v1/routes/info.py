from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Request, Response
from fastapi.params import Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.schemas import InfoResponse
from app.db.models import DatasetRelease, ManPage
from app.db.session import get_session
from app.web.http_cache import compute_weak_etag, maybe_not_modified, set_cache_headers

router = APIRouter()


@router.get("/info", response_model=InfoResponse)
async def get_info(
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> InfoResponse | Response:
    active_release = await session.scalar(
        select(DatasetRelease)
        .where(DatasetRelease.is_active)
        .order_by(DatasetRelease.ingested_at.desc())
        .limit(1)
    )

    if active_release is None:
        return InfoResponse(
            datasetReleaseId="uninitialized",
            locale="en",
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
        pageCount=int(page_count or 0),
        lastUpdated=active_release.ingested_at.astimezone(UTC).isoformat(),
    )
