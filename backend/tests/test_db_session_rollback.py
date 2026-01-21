import pytest
from fastapi import FastAPI
from starlette.requests import Request

from app.db.session import get_session


class _DummySession:
    def __init__(self) -> None:
        self.rollback_called = False

    async def rollback(self) -> None:
        self.rollback_called = True


class _SessionContext:
    def __init__(self, session: _DummySession) -> None:
        self._session = session

    async def __aenter__(self) -> _DummySession:
        return self._session

    async def __aexit__(self, _exc_type, _exc, _tb) -> bool:
        return False


class _SessionMaker:
    def __init__(self, session: _DummySession) -> None:
        self._session = session

    def __call__(self) -> _SessionContext:
        return _SessionContext(self._session)


async def test_get_session_rolls_back_on_error() -> None:
    app = FastAPI()
    dummy = _DummySession()
    app.state.db_sessionmaker = _SessionMaker(dummy)
    req = Request({"type": "http", "app": app, "headers": [], "client": ("127.0.0.1", 1)})

    gen = get_session(req)
    _ = await anext(gen)

    with pytest.raises(RuntimeError):
        await gen.athrow(RuntimeError("boom"))

    assert dummy.rollback_called
