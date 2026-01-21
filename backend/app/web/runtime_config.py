from __future__ import annotations

import json

from fastapi import APIRouter, Request
from starlette.responses import Response

from app.web.http_cache import compute_weak_etag, maybe_not_modified, set_cache_headers

router = APIRouter()


def _json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


@router.get("/config.js", include_in_schema=False)
async def config_js(request: Request) -> Response:
    settings = getattr(request.app.state, "settings", None)

    sentry_dsn = getattr(settings, "vite_sentry_dsn", "") if settings is not None else ""
    plausible_domain = (
        getattr(settings, "vite_plausible_domain", "") if settings is not None else ""
    )

    payload = {
        "sentryDsn": sentry_dsn.strip() or None,
        "plausibleDomain": plausible_domain.strip() or None,
    }

    cache_control = "public, max-age=60"
    etag = compute_weak_etag("config-js", _json(payload))
    not_modified = maybe_not_modified(request, etag=etag, cache_control=cache_control)
    if not_modified is not None:
        return not_modified

    body = f"window.__BETTERMAN_CONFIG__={_json(payload)};"
    res = Response(content=body, media_type="application/javascript; charset=utf-8")
    set_cache_headers(res, etag=etag, cache_control=cache_control)
    return res
