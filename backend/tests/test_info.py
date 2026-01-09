import httpx

from app.db.session import get_session
from app.main import create_app


async def test_info_shape() -> None:
    app = create_app()
    app.dependency_overrides[get_session] = _dummy_session_dep
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/info")
    assert res.status_code == 200
    data = res.json()
    assert set(data.keys()) == {"datasetReleaseId", "locale", "distro", "pageCount", "lastUpdated"}


async def _dummy_session_dep():
    class _DummySession:
        async def scalar(self, *_args, **_kwargs):
            return None

    yield _DummySession()
