"""Real http.client responses over a local socket pair, sent on a schedule."""

from __future__ import annotations

import socket
import threading
import time
from email.message import Message
from http.client import HTTPResponse
from urllib.error import HTTPError


def _serve(parts: list[tuple[bytes, float]]) -> socket.socket:
    """A client socket whose peer sends each part after its delay, then closes."""
    client, server = socket.socketpair()

    def send() -> None:
        try:
            for data, delay in parts:
                time.sleep(delay)
                server.sendall(data)
        except OSError:
            pass  # the reader shut the connection down
        finally:
            server.close()

    threading.Thread(target=send, daemon=True).start()
    return client


def response(head: bytes, parts: list[tuple[bytes, float]], status: bytes = b"200 OK"):
    """`head` holds header lines; `parts` the body bytes, each after a delay."""
    sock = _serve([(b"HTTP/1.1 " + status + b"\r\n" + head + b"\r\n", 0.0), *parts])
    result = HTTPResponse(sock)
    result.begin()
    return result


def trickle(data: bytes, every: float) -> list[tuple[bytes, float]]:
    return [(data[i : i + 1], every) for i in range(len(data))]


def sized(body: bytes) -> bytes:
    return b"Content-Type: application/json\r\nContent-Length: %d\r\n" % len(body)


def http_error(code: int, response_: HTTPResponse) -> HTTPError:
    """An HTTPError over a live response, as urllib raises it."""
    return HTTPError("https://example.test", code, "error", Message(), response_)
