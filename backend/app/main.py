from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from time import perf_counter
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from redis.asyncio import Redis, from_url
from starlette.middleware.cors import CORSMiddleware

from app.api.v1.router import router as v1_router
from app.core.config import Settings
from app.core.errors import APIError
from app.core.logging import configure_logging, get_logger
from app.db.session import create_engine, create_session_maker
from app.security.headers import SecurityHeadersMiddleware
from app.security.request_ip import get_client_ip
from app.web.spa_static import SPAStaticFiles


def create_app() -> FastAPI:
    configure_logging()
    settings = Settings()

    db_engine = create_engine(settings)
    redis: Redis = from_url(settings.redis_url)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        yield
        await db_engine.dispose()
        await redis.aclose()

    app = FastAPI(title="BetterMan API", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings

    app.state.db_engine = db_engine
    app.state.db_sessionmaker = create_session_maker(db_engine)
    app.state.redis = redis

    app.add_middleware(SecurityHeadersMiddleware, env=settings.env)

    if settings.allow_cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.allow_cors_origins,
            allow_credentials=False,
            allow_methods=["GET", "HEAD", "OPTIONS"],
            allow_headers=["*"],
        )

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

    if settings.serve_frontend:
        dist_path = Path(settings.frontend_dist_dir)
        if dist_path.exists() and dist_path.is_dir():
            app.mount("/", SPAStaticFiles(directory=str(dist_path)), name="spa")

    return app


app = create_app()
