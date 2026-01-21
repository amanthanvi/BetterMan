from __future__ import annotations

import os

from app.core.config import Settings
from app.core.logging import get_logger


def init_sentry(settings: Settings) -> None:
    dsn = settings.sentry_dsn.strip()
    if not dsn:
        return

    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration
    except Exception as exc:  # noqa: BLE001
        get_logger(action="sentry").warning("sentry_import_failed", error=str(exc))
        return

    release = os.environ.get("RAILWAY_GIT_COMMIT_SHA") or os.environ.get("GITHUB_SHA")
    traces_sample_rate = 0.1 if settings.env == "prod" else 1.0

    try:
        sentry_sdk.init(
            dsn=dsn,
            environment=settings.env,
            release=release,
            send_default_pii=False,
            traces_sample_rate=traces_sample_rate,
            integrations=[
                FastApiIntegration(),
                StarletteIntegration(),
                SqlalchemyIntegration(),
            ],
        )
        get_logger(action="sentry").info("sentry_enabled")
    except Exception as exc:  # noqa: BLE001
        get_logger(action="sentry").warning("sentry_init_failed", error=str(exc))
