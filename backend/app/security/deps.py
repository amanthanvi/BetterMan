from __future__ import annotations

from time import perf_counter

from fastapi import Request

from app.security.rate_limit import enforce_rate_limit
from app.security.request_ip import get_client_ip


async def rate_limit_search(request: Request) -> None:
    settings = request.app.state.settings
    redis = request.app.state.redis
    ip = get_client_ip(request)
    start = perf_counter()
    await enforce_rate_limit(
        redis=redis,
        key=f"search:{ip}",
        limit=settings.rate_limit_search_per_minute,
    )
    request.state.rate_limit_ms = (perf_counter() - start) * 1000.0


async def rate_limit_page(request: Request) -> None:
    settings = request.app.state.settings
    redis = request.app.state.redis
    ip = get_client_ip(request)
    start = perf_counter()
    await enforce_rate_limit(
        redis=redis,
        key=f"page:{ip}",
        limit=settings.rate_limit_page_per_minute,
    )
    request.state.rate_limit_ms = (perf_counter() - start) * 1000.0
