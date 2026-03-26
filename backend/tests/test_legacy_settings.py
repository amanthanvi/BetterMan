from app.core.config import Settings


def test_legacy_frontend_settings_are_not_exposed() -> None:
    settings = Settings()

    assert settings.vite_sentry_dsn == ""
    assert settings.vite_plausible_domain == ""
    assert not hasattr(settings, "serve_frontend")
    assert not hasattr(settings, "frontend_dist_dir")
