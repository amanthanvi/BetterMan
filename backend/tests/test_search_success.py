import types
import uuid

import httpx

from app.db.session import get_session
from app.main import create_app
from app.security.deps import rate_limit_search


async def test_search_returns_results_and_server_timing() -> None:
    app = create_app()
    app.dependency_overrides[rate_limit_search] = _noop
    app.dependency_overrides[get_session] = _dummy_session_dep

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/search", params={"q": "tar"})

    assert res.status_code == 200
    payload = res.json()
    assert payload["query"] == "tar"
    assert len(payload["results"]) == 1
    assert payload["results"][0]["name"] == "tar"
    assert payload["results"][0]["highlights"] == ["tar archive utility"]
    assert payload["suggestions"] == ["tar", "tarball"]
    server_timing = res.headers["Server-Timing"]
    assert "search_rank" in server_timing
    assert "search_headline" in server_timing
    assert "search_suggest" in server_timing


async def _noop() -> None:
    return None


async def _dummy_session_dep():
    page_id = uuid.UUID("22222222-2222-2222-2222-222222222222")

    class _Rows:
        def __init__(self, rows):
            self._rows = rows

        def all(self):
            return self._rows

    class _Scalars:
        def __init__(self, values):
            self._values = values

        def scalars(self):
            return self._values

    class _DummySession:
        def __init__(self):
            self._execute_calls = 0

        async def scalar(self, *_args, **_kwargs):
            return types.SimpleNamespace(
                id="00000000-0000-0000-0000-000000000000",
                dataset_release_id="test-release",
            )

        async def execute(self, *_args, **_kwargs):
            self._execute_calls += 1

            if self._execute_calls == 1:
                return _Rows(
                    [
                        types.SimpleNamespace(
                            id=page_id,
                            name="tar",
                            section="1",
                            title="tar",
                            description="manipulate tape archives",
                        )
                    ]
                )

            if self._execute_calls == 2:
                return _Rows(
                    [
                        types.SimpleNamespace(
                            man_page_id=page_id,
                            hl="tar archive utility",
                        )
                    ]
                )

            return _Scalars(["tar", "tar", "tarball"])

    yield _DummySession()
