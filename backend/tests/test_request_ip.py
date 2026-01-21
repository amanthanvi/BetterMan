import types

from fastapi import FastAPI
from starlette.requests import Request

from app.security.request_ip import get_client_ip


def _make_request(*, peer_ip: str, xff: str | None, trusted_proxy_cidrs: str) -> Request:
    app = FastAPI()
    app.state.settings = types.SimpleNamespace(trusted_proxy_cidrs=trusted_proxy_cidrs)
    headers: list[tuple[bytes, bytes]] = []
    if xff is not None:
        headers.append((b"x-forwarded-for", xff.encode("utf-8")))
    scope = {"type": "http", "app": app, "headers": headers, "client": (peer_ip, 1234)}
    return Request(scope)


def test_get_client_ip_ignores_xff_when_untrusted() -> None:
    req = _make_request(peer_ip="203.0.113.10", xff="198.51.100.2", trusted_proxy_cidrs="")
    assert get_client_ip(req) == "203.0.113.10"


def test_get_client_ip_uses_xff_when_peer_is_trusted() -> None:
    req = _make_request(peer_ip="10.1.2.3", xff="198.51.100.2, 10.0.0.1", trusted_proxy_cidrs="10.0.0.0/8")
    assert get_client_ip(req) == "198.51.100.2"


def test_get_client_ip_falls_back_when_xff_is_invalid() -> None:
    req = _make_request(peer_ip="10.1.2.3", xff="not-an-ip", trusted_proxy_cidrs="10.0.0.0/8")
    assert get_client_ip(req) == "10.1.2.3"

