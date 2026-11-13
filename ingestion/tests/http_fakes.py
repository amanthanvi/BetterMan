"""A real http.client.HTTPResponse over a socket that trickles one byte per read."""

from __future__ import annotations

import io
from http.client import HTTPResponse


class _Trickle(io.RawIOBase):
    def __init__(self, data: bytes, clock: list[float], step: float) -> None:
        self.data = data
        self.clock = clock
        self.step = step

    def readable(self) -> bool:
        return True

    def readinto(self, buffer) -> int:
        if not self.data:
            return 0
        buffer[0] = self.data[0]
        self.data = self.data[1:]
        self.clock[0] += self.step
        return 1


class _Socket:
    def __init__(self, raw: io.RawIOBase) -> None:
        self.raw = raw

    def makefile(self, mode: str):
        return io.BufferedReader(self.raw, buffer_size=1)


def trickling_response(body: bytes, clock: list[float], step: float) -> HTTPResponse:
    """Headers and body arrive one byte per read; each read advances `clock` by `step`."""
    head = b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n"
    head += b"Content-Length: %d\r\n\r\n" % len(body)
    response = HTTPResponse(_Socket(_Trickle(head + body, clock, step)))
    response.begin()
    return response
