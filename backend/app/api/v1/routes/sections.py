from __future__ import annotations

from fastapi import APIRouter, Query, Request, Response
from fastapi.params import Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.schemas import SectionLabel, SectionResponse
from app.core.errors import APIError
from app.datasets.active import require_active_release
from app.datasets.distro import normalize_distro
from app.db.models import ManPage
from app.db.session import get_session
from app.man.normalize import normalize_section, validate_section
from app.man.sections import SECTION_LABELS
from app.security.deps import rate_limit_page
from app.web.http_cache import compute_weak_etag, maybe_not_modified, set_cache_headers

router = APIRouter()


@router.get("/sections", response_model=list[SectionLabel])
async def list_sections(
    request: Request,
    response: Response,
    distro: str | None = Query(default=None),
    _: None = Depends(rate_limit_page),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> list[SectionLabel] | Response:
    distro_norm = normalize_distro(distro)
    release = await require_active_release(session, distro=distro_norm)

    cache_control = "public, max-age=300"
    etag = compute_weak_etag("sections", release.dataset_release_id)
    not_modified = maybe_not_modified(request, etag=etag, cache_control=cache_control)
    if not_modified is not None:
        return not_modified

    set_cache_headers(response, etag=etag, cache_control=cache_control)
    sections = (
        await session.execute(
            select(ManPage.section).where(ManPage.dataset_release_id == release.id).distinct()
        )
    ).scalars()
    values = sorted({s for s in sections if isinstance(s, str) and s}, key=_section_sort_key)
    return [{"section": section, "label": _section_label(section)} for section in values]


@router.get("/section/{section}", response_model=SectionResponse)
async def list_section(
    request: Request,
    response: Response,
    section: str,
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0, le=5000),
    distro: str | None = Query(default=None),
    _: None = Depends(rate_limit_page),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> SectionResponse | Response:
    section_norm = normalize_section(section)
    validate_section(section_norm)

    distro_norm = normalize_distro(distro)
    release = await require_active_release(session, distro=distro_norm)
    label = _section_label(section_norm)

    cache_control = "public, max-age=300"
    etag = compute_weak_etag(
        "section",
        release.dataset_release_id,
        section_norm,
        str(limit),
        str(offset),
    )
    not_modified = maybe_not_modified(request, etag=etag, cache_control=cache_control)
    if not_modified is not None:
        return not_modified

    total = await session.scalar(
        select(func.count())
        .select_from(ManPage)
        .where(ManPage.dataset_release_id == release.id)
        .where(ManPage.section == section_norm)
    )
    if not total:
        raise APIError(status_code=404, code="SECTION_NOT_FOUND", message="Section not found")

    pages = (
        await session.execute(
            select(ManPage)
            .where(ManPage.dataset_release_id == release.id)
            .where(ManPage.section == section_norm)
            .order_by(ManPage.name.asc(), ManPage.id.asc())
            .limit(limit)
            .offset(offset)
        )
    ).scalars()

    set_cache_headers(response, etag=etag, cache_control=cache_control)
    return SectionResponse(
        section=section_norm,
        label=label,
        limit=limit,
        offset=offset,
        total=int(total or 0),
        results=[
            {
                "name": page.name,
                "section": page.section,
                "title": page.title,
                "description": page.description,
            }
            for page in pages
        ],
    )


def _section_sort_key(section: str) -> tuple[int, int, str]:
    if section and section[0].isdigit():
        digit = int(section[0])
        suffix = section[1:]
        return (0, digit, suffix)
    return (1, 0, section)


_SECTION_SUFFIX_LABELS: dict[str, str] = {
    "p": "POSIX",
    "ssl": "OpenSSL",
}


def _section_label(section: str) -> str:
    section_norm = normalize_section(section)
    if section_norm in SECTION_LABELS:
        return SECTION_LABELS[section_norm]

    if section_norm and section_norm[0] in SECTION_LABELS:
        base = SECTION_LABELS[section_norm[0]]
        suffix = section_norm[1:]
        if not suffix:
            return base
        suffix_label = _SECTION_SUFFIX_LABELS.get(suffix)
        return f"{base} ({suffix_label or suffix})"

    return section_norm
