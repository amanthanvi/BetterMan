from __future__ import annotations

from contextlib import asynccontextmanager
from time import perf_counter
from urllib.parse import urlparse
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from redis.asyncio import Redis, from_url
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware

from app.api.v1.router import router as v1_router
from app.core.config import Settings
from app.core.errors import APIError
from app.core.logging import configure_logging, get_logger
from app.core.observability import init_sentry
from app.db.session import create_engine, create_session_maker
from app.security.headers import SecurityHeadersMiddleware
from app.security.request_ip import get_client_ip


def create_app() -> FastAPI:
    configure_logging()
    settings = Settings()
    init_sentry(settings)

    db_engine = create_engine(settings)
    redis: Redis = from_url(settings.redis_url)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        yield
        await db_engine.dispose()
        await redis.aclose()

    docs_url = None if settings.env == "prod" else "/docs"
    redoc_url = None if settings.env == "prod" else "/redoc"
    openapi_url = None if settings.env == "prod" else "/openapi.json"

    app = FastAPI(
        title="BetterMan API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url=docs_url,
        redoc_url=redoc_url,
        openapi_url=openapi_url,
    )
    app.state.settings = settings

    app.state.db_engine = db_engine
    app.state.db_sessionmaker = create_session_maker(db_engine)
    app.state.redis = redis

    csp_script_src_extra: list[str] = []
    csp_connect_src_extra: list[str] = []

    if settings.vite_plausible_domain.strip():
        csp_script_src_extra.append("https://plausible.io")
        csp_connect_src_extra.append("https://plausible.io")

    for dsn in (settings.sentry_dsn, settings.vite_sentry_dsn):
        try:
            dsn_parsed = urlparse(dsn)
            if dsn_parsed.scheme and dsn_parsed.hostname:
                origin = f"{dsn_parsed.scheme}://{dsn_parsed.hostname}"
                if dsn_parsed.port:
                    origin = f"{origin}:{dsn_parsed.port}"
                csp_connect_src_extra.append(origin)
        except Exception:  # noqa: BLE001
            continue

    csp_script_src_extra = sorted(set(csp_script_src_extra))
    csp_connect_src_extra = sorted(set(csp_connect_src_extra))

    app.add_middleware(
        SecurityHeadersMiddleware,
        env=settings.env,
        csp_enabled=settings.csp_enabled,
        csp_script_src_extra=tuple(csp_script_src_extra),
        csp_connect_src_extra=tuple(csp_connect_src_extra),
    )

    app.add_middleware(GZipMiddleware, minimum_size=1024)

    if settings.allow_cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.allow_cors_origins,
            allow_credentials=False,
            allow_methods=["GET", "HEAD", "OPTIONS"],
            allow_headers=["*"],
        )

    if settings.sentry_dsn.strip():
        try:
            from sentry_sdk.integrations.asgi import SentryAsgiMiddleware

            app.add_middleware(SentryAsgiMiddleware)
        except Exception:  # noqa: BLE001
            get_logger(action="sentry").warning("sentry_middleware_failed")

    app.include_router(v1_router)

    @app.middleware("http")
    async def _request_log(request: Request, call_next):
        request_id = request.headers.get("x-request-id") or uuid4().hex
        start = perf_counter()
        response = await call_next(request)
        elapsed_ms = (perf_counter() - start) * 1000.0

        response.headers.setdefault("X-Request-ID", request_id)

        get_logger(
            request_id=request_id,
            ip=get_client_ip(request),
        ).info(
            "request",
            method=request.method,
            path=request.url.path,
            status=response.status_code,
            duration_ms=round(elapsed_ms, 2),
        )

        return response

    @app.get("/healthz")
    async def healthz() -> dict[str, bool]:
        return {"ok": True}

    @app.get("/api/{path:path}", include_in_schema=False)
    async def _api_not_found(_path: str) -> JSONResponse:
        raise APIError(status_code=404, code="NOT_FOUND", message="Not found")

    @app.exception_handler(APIError)
    async def _handle_api_error(_req: Request, exc: APIError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=exc.to_dict())

    @app.exception_handler(RequestValidationError)
    async def _handle_validation_error(_req: Request, _exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=400,
            content={"error": {"code": "INVALID_REQUEST", "message": "Invalid request"}},
        )

    return app


app = create_app()
