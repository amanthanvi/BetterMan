from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter
from fastapi.params import Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import DatasetRelease, ManPage
from app.db.session import get_session

router = APIRouter()


@router.get("/info")
async def get_info(session: AsyncSession = Depends(get_session)) -> dict[str, object]:  # noqa: B008
    active_release = await session.scalar(
        select(DatasetRelease)
        .where(DatasetRelease.is_active)
        .order_by(DatasetRelease.ingested_at.desc())
        .limit(1)
    )

    if active_release is None:
        return {
            "datasetReleaseId": "uninitialized",
            "locale": "en",
            "pageCount": 0,
            "lastUpdated": datetime.now(tz=UTC).isoformat(),
        }

    page_count = await session.scalar(
        select(func.count())
        .select_from(ManPage)
        .where(ManPage.dataset_release_id == active_release.id)
    )

    return {
        "datasetReleaseId": active_release.dataset_release_id,
        "locale": active_release.locale,
        "pageCount": int(page_count or 0),
        "lastUpdated": active_release.ingested_at.astimezone(UTC).isoformat(),
    }
