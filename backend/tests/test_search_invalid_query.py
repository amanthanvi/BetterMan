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


async def test_search_response_reports_has_more() -> None:
    app = create_app()
    app.dependency_overrides[rate_limit_search] = _noop
    app.dependency_overrides[get_session] = _search_session_dep

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/search", params={"q": "tar", "limit": 2, "offset": 0})

    assert res.status_code == 200
    payload = res.json()
    assert payload["results"] == [
        {
            "name": "tar",
            "section": "1",
            "title": "tar(1)",
            "description": "archive utility",
            "highlights": ["tar archives files"],
        },
        {
            "name": "tarcat",
            "section": "1",
            "title": "tarcat(1)",
            "description": "inspect tar archives",
            "highlights": [],
        },
    ]
    assert payload["hasMore"] is True


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


async def _search_session_dep():
    class _SuggestionResult:
        def scalars(self):
            return iter(["tar"])

    class _SearchResult:
        def all(self):
            return [
                types.SimpleNamespace(
                    name="tar",
                    section="1",
                    title="tar(1)",
                    description="archive utility",
                    hl="tar archives files",
                ),
                types.SimpleNamespace(
                    name="tarcat",
                    section="1",
                    title="tarcat(1)",
                    description="inspect tar archives",
                    hl=None,
                ),
                types.SimpleNamespace(
                    name="tarchive",
                    section="1",
                    title="tarchive(1)",
                    description="extra result",
                    hl=None,
                ),
            ]

    class _DummySession:
        async def scalar(self, *_args, **_kwargs):
            return types.SimpleNamespace(
                id="00000000-0000-0000-0000-000000000000",
                dataset_release_id="test-release",
            )

        async def execute(self, stmt, *_args, **_kwargs):
            rendered = str(stmt)
            if "SELECT man_page_search.name_norm" in rendered:
                return _SuggestionResult()
            return _SearchResult()

    yield _DummySession()
