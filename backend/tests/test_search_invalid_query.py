import types

import httpx
from sqlalchemy.exc import ProgrammingError

from app.db.session import get_session
from app.main import create_app
from app.security.deps import rate_limit_search


async def test_search_invalid_query_returns_400() -> None:
    app = create_app()
    app.dependency_overrides[rate_limit_search] = _noop
    app.dependency_overrides[get_session] = _dummy_session_dep

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/search", params={"q": '"unterminated'})

    assert res.status_code == 400
    payload = res.json()
    assert payload["error"]["code"] == "INVALID_QUERY"


async def _noop() -> None:
    return None


async def _dummy_session_dep():
    class _DummySession:
        async def scalar(self, *_args, **_kwargs):
            return types.SimpleNamespace(
                id="00000000-0000-0000-0000-000000000000",
                dataset_release_id="test-release",
            )

        async def execute(self, *_args, **_kwargs):
            raise ProgrammingError("stmt", None, Exception("bad"))

    yield _DummySession()

