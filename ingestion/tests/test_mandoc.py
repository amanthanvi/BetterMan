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


@pytest.mark.parametrize(
    "roff_request",
    [
        b".if 1 .so sentinel.txt",
        b".ie 1 .so sentinel.txt",
        b".el .so sentinel.txt",
        b"'if 1 'so sentinel.txt",
        b".cc !\n!so sentinel.txt",
        b".cc!\n!so sentinel.txt",
        b".do so sentinel.txt",
        b".if 1.so sentinel.txt",
        b". \\*X sentinel.txt",
        b".if 1 .\\*X sentinel.txt",
        b".ds X so\n.\\*X sentinel.txt",
        b".de X\n.so sentinel.txt\n..\n.X",
        b".ec @\n.@*X sentinel.txt",
        b".eo",
        b".do ec @",
        b".if 1 .ec @",
        b".c2 !",
    ],
)
def test_conditional_host_includes_are_rejected(tmp_path, monkeypatch, roff_request):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "sentinel.txt").write_text("HOST_SECRET_SENTINEL")
    with pytest.raises(
        RuntimeError, match="include request|control-character|Dynamic roff|definition"
    ):
        mandoc.render_html(b".TH BAD 1\n" + roff_request + b"\n")


def test_mandoc_uses_a_fresh_empty_working_directory(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "sentinel.txt").write_text("HOST_SECRET_SENTINEL")
    seen = []

    def run(cmd, **kwargs):
        path = Path(kwargs["cwd"])
        assert path != tmp_path and path.is_dir() and not list(path.iterdir())
        seen.append(path)
        return subprocess.CompletedProcess(cmd, 0, b"html", b"")

    monkeypatch.setattr(mandoc.subprocess, "run", run)
    assert (
        mandoc.render_html(b".TH SAFE 1\n.SH NAME\nsafe - ordinary prose, so it stays\n").html
        == "html"
    )
    assert not seen[0].exists()


def test_include_documentation_is_text_and_known_optional_macros_do_not_read_host(monkeypatch):
    inputs = []

    def run(cmd, **kwargs):
        inputs.append(kwargs["input"])
        return subprocess.CompletedProcess(cmd, 0, b"html", b"")

    monkeypatch.setattr(mandoc.subprocess, "run", run)
    source = b".TH DOC 1\n.B .so\n.BR ld.so (8)\n.if 1 .mso www.tmac\n.B example\n"
    mandoc.render_html(source)
    assert b".B .so" in inputs[0] and b".BR ld.so" in inputs[0]
    assert b"www.tmac" not in inputs[0]
    assert b".B example" in inputs[0]


def test_empty_cwd_does_not_resolve_parent_sentinel_even_without_filter(tmp_path, monkeypatch):
    if not __import__("shutil").which("mandoc"):
        pytest.skip("mandoc not installed")
    monkeypatch.chdir(tmp_path)
    (tmp_path / "sentinel.txt").write_text("HOST_SECRET_SENTINEL")
    # Exercise cwd independently of the defence-in-depth filter. This proves
    # relative include isolation, not an OS sandbox for absolute filesystem paths.
    monkeypatch.setattr(mandoc, "checked_source", lambda source: source)
    try:
        result = mandoc.render_html(b".TH BAD 1\n.if 1 .so sentinel.txt\n")
    except RuntimeError as exc:
        assert "HOST_SECRET_SENTINEL" not in str(exc)
    else:
        assert "HOST_SECRET_SENTINEL" not in result.html


def test_formatting_argument_interpolations_and_macro_comment_are_not_commands(monkeypatch):
    monkeypatch.setattr(
        mandoc.subprocess,
        "run",
        lambda cmd, **kw: subprocess.CompletedProcess(cmd, 0, b"html", b""),
    )
    mandoc.render_html(
        b'.TH DOC 1\n.ie n .IP "quoted.\\*(Aq" 4\n'
        b'.de URL \\" comment\nso this prose stays text\n..\n'
    )
