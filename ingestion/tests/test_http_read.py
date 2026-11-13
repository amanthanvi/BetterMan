from __future__ import annotations

from io import BytesIO

import pytest
from http_fakes import trickling_response

from ingestion.http_read import read_within


def test_a_trickling_body_fails_once_it_takes_longer_than_the_limit():
    now = [0.0]
    response = trickling_response(b"x" * 1000, now, step=1.0)
    with pytest.raises(TimeoutError, match="longer than 60 s"):
        read_within(response, 60, clock=lambda: now[0])
    # It stopped at the limit instead of reading all 1,000 one-second bytes.
    assert now[0] < 1000


def test_a_body_that_arrives_in_time_is_read_whole():
    now = [0.0]
    body = b'{"ok": true, "pages": []}'
    response = trickling_response(body, now, step=0.001)
    assert read_within(response, 60, clock=lambda: now[0]) == body


def test_other_file_likes_are_read_directly():
    assert read_within(BytesIO(b"{}"), 60) == b"{}"
