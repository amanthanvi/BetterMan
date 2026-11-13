from __future__ import annotations

import time
from http.client import IncompleteRead
from io import BytesIO

import pytest
from http_fakes import http_error, response, sized, trickle

from ingestion.http_read import read_within

LIMIT = 0.3


def _timed(fn):
    start = time.monotonic()
    try:
        return fn()
    finally:
        _timed.elapsed = time.monotonic() - start


def test_a_trickling_fixed_length_body_times_out():
    body = b"x" * 200
    res = response(sized(body), trickle(body, 0.05))
    with pytest.raises(TimeoutError, match="longer than 0.3 s"):
        _timed(lambda: read_within(res, LIMIT))
    assert _timed.elapsed < 1.5  # not the 10 s the body would take


def test_a_trickling_chunk_extension_times_out():
    # Chunk framing is read inside the response; the socket shutdown still ends it.
    head = b"Transfer-Encoding: chunked\r\n"
    res = response(head, trickle(b"2;" + b"x" * 400, 0.05))
    with pytest.raises(TimeoutError):
        _timed(lambda: read_within(res, LIMIT))
    assert _timed.elapsed < 1.5


def test_a_trickling_final_trailer_times_out_instead_of_succeeding():
    head = b"Transfer-Encoding: chunked\r\n"
    parts = [(b"2\r\n{}\r\n0\r\n", 0.0), *trickle(b"X-Trailer: " + b"y" * 400, 0.05)]
    res = response(head, parts)
    with pytest.raises(TimeoutError):
        _timed(lambda: read_within(res, LIMIT))
    assert _timed.elapsed < 1.5


def test_a_truncated_body_still_raises_incomplete_read():
    res = response(b"Content-Length: 200\r\n", [(b"{}", 0.0)])
    with pytest.raises(IncompleteRead):
        read_within(res, LIMIT)


def test_a_body_that_arrives_in_time_is_read_whole():
    body = b'{"ok": true, "pages": []}'
    chunked = b"Transfer-Encoding: chunked\r\n"
    framed = b"%x\r\n%s\r\n0\r\n\r\n" % (len(body), body)
    for head, parts in [(sized(body), [(body, 0.0)]), (chunked, [(framed, 0.01)])]:
        assert read_within(response(head, parts), 5) == body


def test_a_trickling_error_body_times_out():
    body = b"x" * 200
    error = http_error(503, response(sized(body), trickle(body, 0.05), status=b"503 Busy"))
    with pytest.raises(TimeoutError):
        _timed(lambda: read_within(error, LIMIT))
    assert _timed.elapsed < 1.5


def test_other_file_likes_are_read_directly():
    assert read_within(BytesIO(b"{}"), 60) == b"{}"
