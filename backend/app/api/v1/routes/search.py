from __future__ import annotations

from fastapi import APIRouter, Query
from fastapi.params import Depends
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import APIError
from app.datasets.active import require_active_release
from app.db.models import ManPage, ManPageContent, ManPageSearch
from app.db.session import get_session
from app.security.deps import rate_limit_search

router = APIRouter()


def _normalize_query(q: str) -> str:
    return " ".join(q.strip().split())


@router.get("/search")
async def search(
    q: str = Query(min_length=1, max_length=200),
    section: str | None = None,
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0, le=5000),
    _: None = Depends(rate_limit_search),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> dict[str, object]:
    query = _normalize_query(q)
    if not query:
        raise APIError(status_code=400, code="INVALID_QUERY", message="Query is required")

    query_norm = query.lower()
    release = await require_active_release(session)

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

    if section is not None:
        where_clauses.append(ManPage.section == section)

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

    return {
        "query": query,
        "results": [
            {
                "name": row.name,
                "section": row.section,
                "title": row.title,
                "description": row.description,
                "highlights": [row.hl] if row.hl else [],
            }
            for row in results
        ],
        "suggestions": list(dict.fromkeys(suggestions)),
    }
