from __future__ import annotations

from fastapi import APIRouter, Query, Request, Response
from fastapi.params import Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.schemas import SuggestResponse
from app.datasets.active import require_active_release
from app.datasets.distro import normalize_distro
from app.db.models import ManPage, ManPageSearch
from app.db.session import get_session
from app.man.normalize import normalize_name, validate_name
from app.security.deps import rate_limit_search
from app.web.http_cache import compute_weak_etag, maybe_not_modified, set_cache_headers

router = APIRouter()


@router.get("/suggest", response_model=SuggestResponse)
async def suggest(
    request: Request,
    response: Response,
    name: str = Query(min_length=1, max_length=200),
    distro: str | None = Query(default=None),
    _: None = Depends(rate_limit_search),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> SuggestResponse | Response:
    name_norm = normalize_name(name)
    validate_name(name_norm)

    distro_norm = normalize_distro(distro)
    release = await require_active_release(session, distro=distro_norm)

    cache_control = "public, max-age=300"
    etag = compute_weak_etag("suggest", release.dataset_release_id, name_norm)
    not_modified = maybe_not_modified(request, etag=etag, cache_control=cache_control)
    if not_modified is not None:
        return not_modified

    rows = (
        await session.execute(
            select(ManPage.name, ManPage.section, ManPage.description)
            .join(ManPageSearch, ManPageSearch.man_page_id == ManPage.id)
            .where(ManPage.dataset_release_id == release.id)
            .where(func.similarity(ManPageSearch.name_norm, name_norm) > 0.2)
            .order_by(
                func.similarity(ManPageSearch.name_norm, name_norm).desc(),
                ManPage.name.asc(),
                ManPage.section.asc(),
            )
            .limit(10)
        )
    ).all()

    suggestions: list[dict[str, str]] = []
    for row in rows:
        name_val, section_val, desc_val = row
        if not isinstance(name_val, str) or not name_val:
            continue
        if not isinstance(section_val, str) or not section_val:
            continue
        if not isinstance(desc_val, str):
            continue
        suggestions.append({"name": name_val, "section": section_val, "description": desc_val})

    set_cache_headers(response, etag=etag, cache_control=cache_control)
    return {"query": name_norm, "suggestions": suggestions}
