import uuid
from datetime import UTC, datetime
from types import SimpleNamespace

import httpx

from app.db.session import get_session
from app.main import create_app


async def test_sitemap_page_route_is_not_shadowed() -> None:
    app = create_app()
    app.dependency_overrides[get_session] = _dummy_session_dep
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/sitemap-debian-1.xml")
    assert res.status_code == 200
    assert "<urlset" in res.text
    assert "/man/tar/1" in res.text


async def _dummy_session_dep():
    release = SimpleNamespace(
        id=uuid.uuid4(),
        dataset_release_id="e2e+debian+abc123+mandoc:1.2.3",
        ingested_at=datetime.now(tz=UTC),
    )

    class _DummyRows:
        def all(self):
            return [("tar", "1")]

    class _DummySession:
        async def scalar(self, *_args, **_kwargs):
            return release

        async def execute(self, *_args, **_kwargs):
            return _DummyRows()

    yield _DummySession()
