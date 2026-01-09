from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import APIError
from app.db.models import DatasetRelease


async def get_active_release(
    session: AsyncSession,
    *,
    locale: str = "en",
    distro: str = "debian",
) -> DatasetRelease | None:
    return await session.scalar(
        select(DatasetRelease)
        .where(DatasetRelease.is_active)
        .where(DatasetRelease.locale == locale)
        .where(DatasetRelease.distro == distro)
        .order_by(DatasetRelease.ingested_at.desc())
        .limit(1)
    )


async def require_active_release(
    session: AsyncSession,
    *,
    locale: str = "en",
    distro: str = "debian",
) -> DatasetRelease:
    active = await get_active_release(session, locale=locale, distro=distro)
    if active is None:
        raise APIError(
            status_code=503,
            code="DATASET_UNAVAILABLE",
            message="Dataset is not available yet",
        )
    return active
