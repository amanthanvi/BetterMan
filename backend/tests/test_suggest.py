import types

import httpx

from app.db.session import get_session
from app.main import create_app
from app.security.deps import rate_limit_search


async def test_suggest_returns_suggestions() -> None:
    app = create_app()
    app.dependency_overrides[rate_limit_search] = _noop
    app.dependency_overrides[get_session] = _dummy_session_dep

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/suggest", params={"name": "grpe"})

    assert res.status_code == 200
    payload = res.json()
    assert payload["query"] == "grpe"
    expected = {
        "name": "grep",
        "section": "1",
        "description": "print lines that match patterns",
    }
    assert expected in payload["suggestions"]


async def _noop() -> None:
    return None


async def _dummy_session_dep():
    class _Result:
        def all(self):
            return [
                ("grep", "1", "print lines that match patterns"),
                ("groups", "1", "print the groups a user is in"),
            ]

    class _DummySession:
        async def scalar(self, *_args, **_kwargs):
            return types.SimpleNamespace(
                id="00000000-0000-0000-0000-000000000000",
                dataset_release_id="test-release",
            )

        async def execute(self, *_args, **_kwargs):
            return _Result()

    yield _DummySession()
