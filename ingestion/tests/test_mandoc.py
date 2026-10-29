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
        b".als X so\n.X sentinel.txt",
        b".rn so X\n.X sentinel.txt",
        b".cc |\n|rn so X\n|X sentinel.txt",
        b".if 1.so sentinel.txt",
        b".if 0+1 .so sentinel.txt",
        b".cc |\n|if 1|so sentinel.txt",
        b". \\*X sentinel.txt",
        b".if 1 .\\*X sentinel.txt",
        b".ds X so\n.\\*X sentinel.txt",
        b".de X\n.so sentinel.txt\n..\n.X",
        b".ec @\n.@*X sentinel.txt",
        b".ec @\n.ds X so\n.@*X sentinel.txt",
        b".do ec @\n.ds X so\n.@*X sentinel.txt",
        b".if 1 .ec @\n.ds X so\n.@*X sentinel.txt",
        b".c2 !\n!so sentinel.txt",
        b".eo\n.so sentinel.txt",
        b".cc |\n|ec @\n|ds X so\n|@*X sentinel.txt",
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


@pytest.mark.parametrize(
    "source",
    [
        b".ec\n.TH SAFE 1\n",
        b".eo\n.\\*X sentinel.txt\n",
        b".eo\n.ds X so\n.\\*X sentinel.txt\n",
        b".cc |\n.so literal text under the old control\n|TH SAFE 1\n",
        b".c2 !\n' so literal text under the old no-break control\n!TH SAFE 1\n",
        b".ec @\n.\\*X is no longer an interpolation\n",
        b".ds X B\n.\\*X safe formatting\n",
        b".if 0 .so ignored.txt\n",
        b".if 0 .cc |\n.TH SAFE 1\n",
        b".eo\n.ec\n.TH SAFE 1\n",
    ],
)
def test_syntax_changes_and_inactive_escape_requests_are_preserved(source):
    assert mandoc.checked_source(source) == source


def test_control_and_escape_resets_restore_include_checks():
    for source in [
        b".cc |\n|cc\n.so sentinel.txt\n",
        b".c2 !\n!c2\n'so sentinel.txt\n",
        b".eo\n.ec\n.ds X so\n.\\*X sentinel.txt\n",
        b".if n .cc |\n|so sentinel.txt\n",
    ]:
        with pytest.raises(RuntimeError, match="include request|definition"):
            mandoc.checked_source(source)


def test_literal_archive_include_resolver_obeys_current_controls():
    seen = []
    source = b".cc |\n.so ordinary text\n|so man1/target.1\n"
    result = mandoc.checked_source(source, include=lambda path: seen.append(path) or b"resolved")
    assert seen == ["man1/target.1"]
    assert b".so ordinary text" in result and b"resolved" in result


@pytest.mark.parametrize("body", [b"text\\\n.so sentinel.txt\n", b".s\\\no sentinel.txt\n"])
def test_conditional_escape_changes_check_both_continuation_interpretations(body):
    with pytest.raises(RuntimeError, match="include request"):
        mandoc.checked_source(b".if n .eo\n" + body)


def test_conditional_escape_changes_preserve_benign_physical_lines():
    source = b".if n .eo\nordinary\\\nprose\n"
    assert mandoc.checked_source(source) == source
