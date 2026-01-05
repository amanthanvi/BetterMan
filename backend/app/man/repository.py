from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ManPage, ManPageContent, ManPageLink


async def list_pages_by_name(
    session: AsyncSession, *, release_id: uuid.UUID, name: str
) -> list[ManPage]:
    result = await session.execute(
        select(ManPage)
        .where(ManPage.dataset_release_id == release_id)
        .where(ManPage.name == name)
        .order_by(ManPage.section.asc(), ManPage.id.asc())
    )
    return list(result.scalars())


async def get_page_with_content(
    session: AsyncSession, *, release_id: uuid.UUID, name: str, section: str
) -> tuple[ManPage, ManPageContent] | None:
    result = await session.execute(
        select(ManPage, ManPageContent)
        .join(ManPageContent, ManPageContent.man_page_id == ManPage.id)
        .where(ManPage.dataset_release_id == release_id)
        .where(ManPage.name == name)
        .where(ManPage.section == section)
        .limit(1)
    )
    row = result.one_or_none()
    if row is None:
        return None
    return row[0], row[1]


async def list_related_pages(session: AsyncSession, *, from_page_id: uuid.UUID) -> list[ManPage]:
    result = await session.execute(
        select(ManPage)
        .join(ManPageLink, ManPageLink.to_page_id == ManPage.id)
        .where(ManPageLink.from_page_id == from_page_id)
        .where(ManPageLink.link_type.in_(["see_also", "xref"]))
        .order_by(ManPageLink.link_type.asc(), ManPage.name.asc(), ManPage.section.asc())
        .limit(50)
    )
    return list(result.scalars())
