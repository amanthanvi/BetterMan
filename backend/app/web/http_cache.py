from __future__ import annotations

import hashlib

from fastapi import Request
from starlette.responses import Response


def compute_weak_etag(*parts: str) -> str:
    raw = "|".join(parts).encode("utf-8")
    digest = hashlib.sha1(raw).hexdigest()  # noqa: S324 (non-crypto; cache key only)
    return f'W/"{digest}"'


def maybe_not_modified(request: Request, *, etag: str, cache_control: str) -> Response | None:
    inm = request.headers.get("if-none-match")
    if inm and inm.strip() == etag:
        return Response(
            status_code=304,
            headers={
                "ETag": etag,
                "Cache-Control": cache_control,
            },
        )
    return None


def set_cache_headers(response: Response, *, etag: str, cache_control: str) -> None:
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = cache_control
