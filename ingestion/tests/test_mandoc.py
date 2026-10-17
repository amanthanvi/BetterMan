from __future__ import annotations

import gzip
import subprocess
from pathlib import Path

import pytest

import ingestion.mandoc as mandoc


def test_read_roff_detects_gzip_by_content(tmp_path: Path) -> None:
    upper = tmp_path / "tar.1.GZ"
    upper.write_bytes(gzip.compress(b".TH TAR 1\n"))
    plain = tmp_path / "odd.1.gz"
    plain.write_bytes(b".TH ODD 1\n")

    assert mandoc.read_roff(upper) == b".TH TAR 1\n"
    assert mandoc.read_roff(plain) == b".TH ODD 1\n"


def test_render_html_times_out(monkeypatch) -> None:
    def fake_run(cmd: list[str], **kwargs: object):
        raise subprocess.TimeoutExpired(cmd, kwargs["timeout"])

    monkeypatch.setattr(mandoc.subprocess, "run", fake_run)

    with pytest.raises(RuntimeError, match="mandoc timed out after 120s"):
        mandoc.render_html(b".TH SLOW 1\n")
