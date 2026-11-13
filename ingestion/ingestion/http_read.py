"""Read an HTTP response body within a total time limit.

A socket timeout bounds each receive, not the whole body: a server that keeps
sending a byte at a time restarts it with every byte, in the body, in chunk
framing or in trailers, and can hold a request indefinitely. `read_within`
reads the body as usual (so a truncated body still raises IncompleteRead) and
shuts the connection's socket down if the read is still going at the limit,
which wakes any blocked receive; the read then raises TimeoutError. The
connection is not reused afterwards.
"""

from __future__ import annotations

import socket
import threading
from http.client import HTTPResponse

# HTTP error bodies (429, 5xx) are short notices; the request's own timeout is
# not known where they are read.
ERROR_BODY_SECONDS = 30.0


def _socket_of(response: object) -> socket.socket | None:
    """The connected socket under a urllib response or an HTTPError wrapping one."""
    fp = getattr(response, "fp", None)
    if isinstance(fp, HTTPResponse):
        fp = fp.fp
    sock = getattr(getattr(fp, "raw", None), "_sock", None)
    return sock if isinstance(sock, socket.socket) else None


def read_within(response: object, seconds: float) -> bytes:
    """The whole body, or TimeoutError if reading it takes longer than `seconds`.

    `response` is an http.client.HTTPResponse or an HTTPError. Anything without
    a socket underneath (test doubles, other file-likes) is read directly.
    """
    sock = _socket_of(response)
    if sock is None:
        return response.read()  # type: ignore[attr-defined]
    lock = threading.Lock()
    state = {"done": False, "aborted": False}

    def abort() -> None:
        with lock:
            if state["done"]:
                return
            state["aborted"] = True
        try:
            # The base method: an SSLSocket's own shutdown also drops its TLS state.
            socket.socket.shutdown(sock, socket.SHUT_RDWR)
        except OSError:
            pass

    def finish() -> bool:
        with lock:
            state["done"] = True
            return state["aborted"]

    timer = threading.Timer(seconds, abort)
    timer.daemon = True
    timer.start()
    try:
        data = response.read()  # type: ignore[attr-defined]
    except Exception as exc:
        if finish():
            raise TimeoutError(f"response body took longer than {seconds:g} s") from exc
        raise
    finally:
        timer.cancel()
    if finish():
        raise TimeoutError(f"response body took longer than {seconds:g} s")
    return data
