from __future__ import annotations

import uuid

from fastapi import APIRouter, Query, Request, Response
from fastapi.params import Depends
from sqlalchemy import case, func, select
from sqlalchemy.exc import DataError, ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.schemas import SearchResponse
from app.core.errors import APIError
from app.datasets.active import require_active_release
from app.datasets.distro import normalize_distro
from app.db.models import ManPage, ManPageContent, ManPageSearch
from app.db.session import get_session
from app.man.normalize import normalize_section, validate_section
from app.security.deps import rate_limit_search
from app.web.http_cache import compute_weak_etag, maybe_not_modified, set_cache_headers
from app.web.server_timing import attach_server_timing, elapsed_ms, mark

router = APIRouter()


def _normalize_query(q: str) -> str:
    return " ".join(q.strip().split())


@router.get("/search", response_model=SearchResponse)
async def search(
    request: Request,
    response: Response,
    q: str = Query(min_length=1, max_length=200),
    section: str | None = None,
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0, le=5000),
    distro: str | None = Query(default=None),
    _: None = Depends(rate_limit_search),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> SearchResponse | Response:
    server_timing = _server_timing_seed(request)
    query = _normalize_query(q)
    if not query:
        raise APIError(status_code=400, code="INVALID_QUERY", message="Query is required")

    query_norm = query.lower()
    section_norm = None
    if section is not None:
        section_norm = normalize_section(section)
        validate_section(section_norm)

    distro_norm = normalize_distro(distro)
    release_started = mark()
    release = await require_active_release(session, distro=distro_norm)
    server_timing.append(("active_release", elapsed_ms(release_started)))

    cache_control = "public, max-age=300"
    etag = compute_weak_etag(
        "search",
        release.dataset_release_id,
        query,
        section_norm or "",
        str(limit),
        str(offset),
    )
    not_modified = maybe_not_modified(request, etag=etag, cache_control=cache_control)
    if not_modified is not None:
        attach_server_timing(not_modified, server_timing)
        return not_modified

    tsquery = func.websearch_to_tsquery("simple", query)

    similarity_name = func.similarity(ManPageSearch.name_norm, query_norm)
    similarity_desc = func.similarity(ManPageSearch.desc_norm, query_norm)
    similarity_best = func.greatest(similarity_name, similarity_desc)

    score = (
        case((ManPageSearch.name_norm == query_norm, 1000), else_=0)
        + case((ManPageSearch.name_norm.like(f"{query_norm}%"), 100), else_=0)
        + (func.ts_rank_cd(ManPageSearch.tsv, tsquery) * 10)
        + (similarity_best * 2)
    )

    where_clauses = [
        ManPage.dataset_release_id == release.id,
        func.coalesce(ManPageSearch.tsv.op("@@")(tsquery), False)
        | ManPageSearch.name_norm.like(f"{query_norm}%")
        | (similarity_best > 0.3),
    ]

    if section_norm is not None:
        where_clauses.append(ManPage.section == section_norm)

    headline_opts = "MaxFragments=2, MinWords=3, MaxWords=15, StartSel=⟪, StopSel=⟫"

    try:
        search_started = mark()
        ranked_results = (
            await session.execute(
                select(
                    ManPage.id,
                    ManPage.name,
                    ManPage.section,
                    ManPage.title,
                    ManPage.description,
                )
                .join(ManPageSearch, ManPageSearch.man_page_id == ManPage.id)
                .where(*where_clauses)
                .order_by(
                    score.desc(),
                    func.length(ManPage.name).asc(),
                    ManPage.section.asc(),
                    ManPage.id.asc(),
                )
                .limit(limit + 1)
                .offset(offset)
            )
        ).all()
        server_timing.append(("search_rank", elapsed_ms(search_started)))

        has_more = len(ranked_results) > limit
        visible_results = ranked_results[:limit]

        highlights_by_page_id: dict[uuid.UUID, str] = {}
        if visible_results:
            headline_started = mark()
            page_ids = [row.id for row in visible_results]
            highlights = (
                await session.execute(
                    select(
                        ManPageContent.man_page_id,
                        func.ts_headline(
                            "simple",
                            ManPageContent.plain_text,
                            tsquery,
                            headline_opts,
                        ).label("hl"),
                    ).where(ManPageContent.man_page_id.in_(page_ids))
                )
            ).all()
            highlights_by_page_id = {row.man_page_id: row.hl for row in highlights if row.hl}
            server_timing.append(("search_headline", elapsed_ms(headline_started)))
        else:
            server_timing.append(("search_headline", 0.0))

        suggestions_started = mark()
        suggestions = (
            await session.execute(
                select(ManPageSearch.name_norm)
                .join(ManPage, ManPage.id == ManPageSearch.man_page_id)
                .where(ManPage.dataset_release_id == release.id)
                .where(func.similarity(ManPageSearch.name_norm, query_norm) > 0.3)
                .order_by(func.similarity(ManPageSearch.name_norm, query_norm).desc())
                .limit(5)
            )
        ).scalars()
        server_timing.append(("search_suggest", elapsed_ms(suggestions_started)))
    except (DataError, ProgrammingError):
        raise APIError(
            status_code=400,
            code="INVALID_QUERY",
            message="Invalid search query",
        ) from None

    next_offset = offset + len(visible_results) if has_more else None

    set_cache_headers(response, etag=etag, cache_control=cache_control)
    attach_server_timing(response, server_timing)
    return SearchResponse(
        query=query,
        results=[
            {
                "name": row.name,
                "section": row.section,
                "title": row.title,
                "description": row.description,
                "highlights": [hl] if (hl := highlights_by_page_id.get(row.id)) else [],
            }
            for row in visible_results
        ],
        suggestions=list(dict.fromkeys(suggestions)),
        hasMore=has_more,
        nextOffset=next_offset,
    )


def _server_timing_seed(request: Request) -> list[tuple[str, float]]:
    rate_limit_ms = getattr(request.state, "rate_limit_ms", None)
    if isinstance(rate_limit_ms, (int, float)):
        return [("rate_limit", float(rate_limit_ms))]
    return []
