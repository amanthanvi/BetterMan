from __future__ import annotations

from fastapi import APIRouter, Query
from fastapi.params import Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import APIError
from app.datasets.active import require_active_release
from app.db.models import ManPage
from app.db.session import get_session
from app.man.sections import SECTION_LABELS

router = APIRouter()


@router.get("/sections")
async def list_sections() -> list[dict[str, str]]:
    return [{"section": section, "label": label} for section, label in SECTION_LABELS.items()]


@router.get("/section/{section}")
async def list_section(
    section: str,
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0, le=5000),
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> dict[str, object]:
    label = SECTION_LABELS.get(section)
    if label is None:
        raise APIError(status_code=404, code="SECTION_NOT_FOUND", message="Section not found")

    release = await require_active_release(session)

    total = await session.scalar(
        select(func.count())
        .select_from(ManPage)
        .where(ManPage.dataset_release_id == release.id)
        .where(ManPage.section == section)
    )

    pages = (
        await session.execute(
            select(ManPage)
            .where(ManPage.dataset_release_id == release.id)
            .where(ManPage.section == section)
            .order_by(ManPage.name.asc(), ManPage.id.asc())
            .limit(limit)
            .offset(offset)
        )
    ).scalars()

    return {
        "section": section,
        "label": label,
        "limit": limit,
        "offset": offset,
        "total": int(total or 0),
        "results": [
            {
                "name": page.name,
                "section": page.section,
                "title": page.title,
                "description": page.description,
            }
            for page in pages
        ],
    }
