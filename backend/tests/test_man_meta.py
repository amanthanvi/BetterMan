import types

import httpx

from app.db.session import get_session
from app.main import create_app
from app.security.deps import rate_limit_page


async def test_man_meta_shape_and_server_timing() -> None:
    app = create_app()
    app.dependency_overrides[rate_limit_page] = _noop
    app.dependency_overrides[get_session] = _dummy_session_dep

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/man/bash/1/meta")

    assert res.status_code == 200
    payload = res.json()
    assert set(payload.keys()) == {"page"}
    assert payload["page"]["name"] == "bash"
    assert payload["page"]["section"] == "1"
    assert "Server-Timing" in res.headers


async def _noop() -> None:
    return None


async def _dummy_session_dep():
    class _Result:
        def scalar_one_or_none(self):
            return types.SimpleNamespace(
                id="11111111-1111-1111-1111-111111111111",
                name="bash",
                section="1",
                title="GNU Bourne Again SHell",
                description="command language interpreter",
                source_package="bash",
                source_package_version="5.2",
                content_sha256="abc123",
            )

    class _DummySession:
        async def scalar(self, *_args, **_kwargs):
            return types.SimpleNamespace(
                id="00000000-0000-0000-0000-000000000000",
                dataset_release_id="test-release",
                locale="en",
                distro="debian",
            )

        async def execute(self, *_args, **_kwargs):
            return _Result()

    yield _DummySession()
