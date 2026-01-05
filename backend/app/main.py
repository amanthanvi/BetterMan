from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware

from app.api.v1.router import router as v1_router
from app.core.config import Settings
from app.core.errors import APIError
from app.core.logging import configure_logging
from app.db.session import create_engine, create_session_maker


def create_app() -> FastAPI:
    configure_logging()
    settings = Settings()

    app = FastAPI(title="BetterMan API", version="0.1.0")
    app.state.settings = settings

    db_engine = create_engine(settings)
    app.state.db_engine = db_engine
    app.state.db_sessionmaker = create_session_maker(db_engine)

    if settings.allow_cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.allow_cors_origins,
            allow_credentials=False,
            allow_methods=["GET", "HEAD", "OPTIONS"],
            allow_headers=["*"],
        )

    app.include_router(v1_router)

    @app.get("/healthz")
    async def healthz() -> dict[str, bool]:
        return {"ok": True}

    @app.on_event("shutdown")
    async def _shutdown() -> None:
        await db_engine.dispose()

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
