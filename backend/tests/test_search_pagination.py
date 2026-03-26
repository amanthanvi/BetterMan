import types

import httpx

from app.db.session import get_session
from app.main import create_app
from app.security.deps import rate_limit_search


async def test_search_reports_has_more_when_extra_results_exist() -> None:
    app = create_app()
    app.dependency_overrides[rate_limit_search] = _noop
    app.dependency_overrides[get_session] = _dummy_session_dep_with_rows(
        [
            ("tar", "1", "tar(1)", "archive utility", "tar snippets"),
            ("tar-split", "1", "tar-split(1)", "split tar archives", "more snippets"),
        ]
    )

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/search", params={"q": "tar", "limit": 1})

    assert res.status_code == 200
    payload = res.json()
    assert payload["hasMore"] is True
    assert len(payload["results"]) == 1


async def test_search_reports_has_more_false_at_end() -> None:
    app = create_app()
    app.dependency_overrides[rate_limit_search] = _noop
    app.dependency_overrides[get_session] = _dummy_session_dep_with_rows(
        [("tar", "1", "tar(1)", "archive utility", "tar snippets")]
    )

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/search", params={"q": "tar", "limit": 20})

    assert res.status_code == 200
    payload = res.json()
    assert payload["hasMore"] is False
    assert len(payload["results"]) == 1


async def _noop() -> None:
    return None


def _dummy_session_dep_with_rows(rows: list[tuple[str, str, str, str, str]]):
    async def _dep():
        class _Result:
            def __init__(self, values):
                self._values = values

            def all(self):
                return self._values

            def scalars(self):
                return self

            def __iter__(self):
                return iter(["tar"])

        class _DummySession:
            def __init__(self):
                self.calls = 0

            async def scalar(self, *_args, **_kwargs):
                return types.SimpleNamespace(
                    id="00000000-0000-0000-0000-000000000000",
                    dataset_release_id="test-release",
                )

            async def execute(self, *_args, **_kwargs):
                self.calls += 1
                if self.calls == 1:
                    return _Result(
                        [
                            types.SimpleNamespace(
                                name=name,
                                section=section,
                                title=title,
                                description=description,
                                hl=highlight,
                            )
                            for name, section, title, description, highlight in rows
                        ]
                    )
                return _Result([])

        yield _DummySession()

    return _dep
