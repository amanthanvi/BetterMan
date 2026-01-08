from __future__ import annotations

from fastapi import APIRouter, Query, Request, Response
from fastapi.params import Depends
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.schemas import SearchResponse
from app.core.errors import APIError
from app.datasets.active import require_active_release
from app.db.models import ManPage, ManPageContent, ManPageSearch
from app.db.session import get_session
from app.man.normalize import normalize_section, validate_section
from app.security.deps import rate_limit_search
from app.web.http_cache import compute_weak_etag, maybe_not_modified, set_cache_headers

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
    _: None = Depends(rate_limit_search),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> SearchResponse | Response:
    query = _normalize_query(q)
    if not query:
        raise APIError(status_code=400, code="INVALID_QUERY", message="Query is required")

    query_norm = query.lower()
    section_norm = None
    if section is not None:
        section_norm = normalize_section(section)
        validate_section(section_norm)
    release = await require_active_release(session)

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

    results = (
        await session.execute(
            select(
                ManPage.name,
                ManPage.section,
                ManPage.title,
                ManPage.description,
                func.ts_headline(
                    "simple",
                    ManPageContent.plain_text,
                    tsquery,
                    headline_opts,
                ).label("hl"),
            )
            .join(ManPageSearch, ManPageSearch.man_page_id == ManPage.id)
            .join(ManPageContent, ManPageContent.man_page_id == ManPage.id)
            .where(*where_clauses)
            .order_by(
                score.desc(),
                func.length(ManPage.name).asc(),
                ManPage.section.asc(),
                ManPage.id.asc(),
            )
            .limit(limit)
            .offset(offset)
        )
    ).all()

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

    set_cache_headers(response, etag=etag, cache_control=cache_control)
    return SearchResponse(
        query=query,
        results=[
            {
                "name": row.name,
                "section": row.section,
                "title": row.title,
                "description": row.description,
                "highlights": [row.hl] if row.hl else [],
            }
            for row in results
        ],
        suggestions=list(dict.fromkeys(suggestions)),
    )
