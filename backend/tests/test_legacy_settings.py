import os

from app.core.config import Settings


def test_legacy_frontend_settings_are_not_exposed() -> None:
    old_vite_sentry_dsn = os.environ.pop("VITE_SENTRY_DSN", None)
    old_vite_plausible_domain = os.environ.pop("VITE_PLAUSIBLE_DOMAIN", None)
    try:
        settings = Settings()

        assert settings.vite_sentry_dsn == ""
        assert settings.vite_plausible_domain == ""
        assert not hasattr(settings, "serve_frontend")
        assert not hasattr(settings, "frontend_dist_dir")
    finally:
        if old_vite_sentry_dsn is not None:
            os.environ["VITE_SENTRY_DSN"] = old_vite_sentry_dsn
        if old_vite_plausible_domain is not None:
            os.environ["VITE_PLAUSIBLE_DOMAIN"] = old_vite_plausible_domain
