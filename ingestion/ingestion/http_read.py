"""Read an HTTP response body within a total time limit.

A socket timeout bounds each read, not the whole body: a server that keeps
sending a byte at a time restarts it with every byte and can hold a request
indefinitely. `read_within` reads a real response one underlying read at a
time and gives up once the body has taken longer than the request's timeout.
Well-behaved servers send these JSON bodies in one go, so only a trickling
response is cut off.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from http.client import HTTPResponse

CHUNK_BYTES = 64 * 1024
# Monotonic clock; tests replace it.
_clock = time.monotonic


def read_within(
    response: object,
    seconds: float,
    *,
    clock: Callable[[], float] | None = None,
) -> bytes:
    """The whole body, or TimeoutError once reading it has taken `seconds`."""
    if not isinstance(response, HTTPResponse):
        # Test doubles and other file-likes: nothing to trickle.
        return response.read()  # type: ignore[attr-defined]
    clock = clock or _clock
    deadline = clock() + seconds
    parts: list[bytes] = []
    while True:
        if clock() > deadline:
            raise TimeoutError(f"response body took longer than {seconds:g} s")
        data = response.read1(CHUNK_BYTES)
        if not data:
            return b"".join(parts)
        parts.append(data)
