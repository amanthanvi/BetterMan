"""Tests for the quick-win hardening batch: upload payload slimming, post
retry, mandoc timeout, gzip sniffing, name regexes, publish gates, and the
fedora rpm -qf chunk fallback."""

from __future__ import annotations

import gzip
import http.client
import subprocess
from io import BytesIO
from pathlib import Path
from unittest.mock import Mock
from urllib.error import HTTPError, URLError

import pytest

from ingestion import ingest_runner
from ingestion.convex_client import ConvexIngestClient
from ingestion.fedora import build_manpath_to_package
from ingestion.ingest_runner import _NAME_RE, _page_payload, _PageRow
from ingestion.man_scan import ManSource, find_man_source, scan_man_sources
from ingestion.mandoc import MANDOC_TIMEOUT_SECONDS, decompress_roff, read_roff, render_html
from ingestion.util import normalize_ws


def _page(name: str, section: str, plain_text: str = "") -> _PageRow:
    from uuid import uuid4

    return _PageRow(
        page_id=uuid4(),
        name=name,
        section=section,
        title=f"{name}({section})",
        description="desc",
        source_path=f"/usr/share/man/man{section}/{name}.{section}",
        source_package=None,
        source_package_version=None,
        content_sha256="x",
        has_parse_warnings=False,
        doc={"toc": [], "blocks": []},
        plain_text=plain_text,
        synopsis=None,
        options=None,
        see_also=None,
        headings_text="",
        see_also_refs=[],
    )


def test_page_payload_sends_only_what_the_server_reads() -> None:
    row = _page("big", "1", plain_text="x" * 1000)
    payload = _page_payload(row, sitemap_page=1, links=[])
    # The server ignores searchText and truncates snippetText to 240 chars;
    # the client must not upload text the server discards.
    assert payload["searchText"] == ""
    expected = normalize_ws(f"{row.description} {row.plain_text}")[:240]
    assert payload["snippetText"] == expected
    assert len(payload["snippetText"]) <= 240


def test_post_retries_transient_urlerror_on_idempotent_batches(monkeypatch) -> None:
    ok = BytesIO(b"{}")
    request = Mock(side_effect=[URLError("boom"), URLError("boom"), ok])
    monkeypatch.setattr("ingestion.convex_client.urlopen", request)
    monkeypatch.setattr("ingestion.convex_client.time.sleep", Mock())
    monkeypatch.setattr("ingestion.convex_client.random.uniform", Mock(return_value=0))
    result = ConvexIngestClient("https://test.convex.site", "s").post("/ingest/pages/storage", {})
    assert result == {}
    assert request.call_count == 3


def test_post_retries_5xx_but_not_4xx(monkeypatch) -> None:
    fail = HTTPError("https://test.convex.site", 503, "Failure", {}, BytesIO(b"boom"))
    ok = BytesIO(b'{"ok":true}')
    request = Mock(side_effect=[fail, ok])
    monkeypatch.setattr("ingestion.convex_client.urlopen", request)
    monkeypatch.setattr("ingestion.convex_client.time.sleep", Mock())
    monkeypatch.setattr("ingestion.convex_client.random.uniform", Mock(return_value=0))
    result = ConvexIngestClient("https://test.convex.site", "s").post("/ingest/aliases", {})
    assert result == {"ok": True}
    assert request.call_count == 2

    bad_request = HTTPError("https://test.convex.site", 400, "Bad", {}, BytesIO(b"nope"))
    request4 = Mock(side_effect=bad_request)
    monkeypatch.setattr("ingestion.convex_client.urlopen", request4)
    with pytest.raises(RuntimeError, match="Convex ingest HTTP 400"):
        ConvexIngestClient("https://test.convex.site", "s").post("/ingest/pages", {})
    request4.assert_called_once()


def test_post_never_retries_release_creation(monkeypatch) -> None:
    request = Mock(side_effect=URLError("boom"))
    monkeypatch.setattr("ingestion.convex_client.urlopen", request)
    monkeypatch.setattr("ingestion.convex_client.time.sleep", Mock())
    with pytest.raises(RuntimeError, match="request failed"):
        ConvexIngestClient("https://test.convex.site", "s").post("/ingest/release", {})
    request.assert_called_once()


def test_post_gives_up_after_bounded_attempts(monkeypatch) -> None:
    request = Mock(side_effect=URLError("boom"))
    monkeypatch.setattr("ingestion.convex_client.urlopen", request)
    monkeypatch.setattr("ingestion.convex_client.time.sleep", Mock())
    monkeypatch.setattr("ingestion.convex_client.random.uniform", Mock(return_value=0))
    with pytest.raises(RuntimeError, match="request failed"):
        ConvexIngestClient("https://test.convex.site", "s").post("/ingest/licenses", {})
    assert request.call_count == 3


def test_post_retries_response_level_transport_failures(monkeypatch) -> None:
    # TimeoutError surfaces from socket reads, IncompleteRead from truncated bodies.
    ok = BytesIO(b"{}")
    request = Mock(side_effect=[TimeoutError("timed out"), ok])
    monkeypatch.setattr("ingestion.convex_client.urlopen", request)
    monkeypatch.setattr("ingestion.convex_client.time.sleep", Mock())
    monkeypatch.setattr("ingestion.convex_client.random.uniform", Mock(return_value=0))
    assert ConvexIngestClient("https://test.convex.site", "s").post("/ingest/pages", {}) == {}
    assert request.call_count == 2

    class _TruncatedBody:
        def read(self):
            raise http.client.IncompleteRead(b"partial")

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    request2 = Mock(side_effect=[_TruncatedBody(), BytesIO(b"{}")])
    monkeypatch.setattr("ingestion.convex_client.urlopen", request2)
    assert ConvexIngestClient("https://test.convex.site", "s").post("/ingest/pages", {}) == {}
    assert request2.call_count == 2


def test_post_transport_failures_stay_single_attempt_on_release(monkeypatch) -> None:
    request = Mock(side_effect=TimeoutError("timed out"))
    monkeypatch.setattr("ingestion.convex_client.urlopen", request)
    with pytest.raises(RuntimeError, match="transport failed"):
        ConvexIngestClient("https://test.convex.site", "s").post("/ingest/release", {})
    request.assert_called_once()


def test_decompress_roff_sniffs_magic_bytes() -> None:
    plain = b".TH tar 1\n"
    packed = gzip.compress(plain)
    assert decompress_roff(plain) == plain
    assert decompress_roff(packed) == plain


def test_read_roff_handles_uppercase_gz_suffix(tmp_path: Path) -> None:
    plain = b".TH tar 1\n"
    path = tmp_path / "tar.1.GZ"
    path.write_bytes(gzip.compress(plain))
    # Filename sniffing missed .GZ before; magic-byte sniffing catches it.
    assert read_roff(path) == plain


def test_scan_discovers_uppercase_gz_files(tmp_path: Path) -> None:
    man1 = tmp_path / "man1"
    man1.mkdir()
    (man1 / "tar.1.GZ").write_bytes(gzip.compress(b".TH tar 1\n"))
    (man1 / "ls.1.gz").write_bytes(gzip.compress(b".TH ls 1\n"))
    (man1 / "notes.txt").write_bytes(b"not a man page")

    assert [(s.name, s.section) for s in scan_man_sources(tmp_path, sample=False)] == [
        ("ls", "1"),
        ("tar", "1"),
    ]

    found = find_man_source(tmp_path, name="tar", section="1")
    assert found is not None
    assert found.path.name == "tar.1.GZ"
    # And the discovered page parses end-to-end through the shared byte flow.
    assert read_roff(found.path) == b".TH tar 1\n"


def test_render_html_times_out_as_page_failure(monkeypatch) -> None:
    def fake_run(*_args, **_kwargs):
        raise subprocess.TimeoutExpired(cmd="mandoc", timeout=MANDOC_TIMEOUT_SECONDS)

    monkeypatch.setattr("ingestion.mandoc.subprocess.run", fake_run)
    with pytest.raises(RuntimeError, match="mandoc timed out"):
        render_html(b".TH tar 1\n")


def test_name_regex_rejects_backslash() -> None:
    assert _NAME_RE.fullmatch("foo\\bar") is None
    for ok in ("foo-bar", "g++", "foo.bar", "openssl", "a"):
        assert _NAME_RE.fullmatch(ok), ok


def _install_gate_harness(monkeypatch, sources, outcomes, calls):
    monkeypatch.setattr(ingest_runner, "apt_install", lambda _packages: None)
    monkeypatch.setattr(ingest_runner, "scan_man_sources", lambda *_a, **_k: sources)
    monkeypatch.setattr(ingest_runner, "dpkg_packages", lambda: {"example": "1.0"})
    monkeypatch.setattr(ingest_runner, "dpkg_arch", lambda: "amd64")
    monkeypatch.setattr(ingest_runner, "mandoc_pkg_version_dpkg", lambda _p: "1.0")
    monkeypatch.setattr(ingest_runner, "build_manpath_to_package_dpkg", lambda: {})
    monkeypatch.setattr(ingest_runner, "_read_bytes", lambda _path: b".TH x 1\n")
    monkeypatch.setattr(ingest_runner, "_alias_for_source", lambda _src, _raw: None)

    def fake_parse(src, _raw, **_kwargs):
        if src.name in outcomes:
            raise RuntimeError("parse exploded")
        return _page(src.name, src.section)

    monkeypatch.setattr(ingest_runner, "_parse_source", fake_parse)
    monkeypatch.setattr(ingest_runner, "_collect_licenses", lambda **_k: {})
    monkeypatch.setattr(
        ingest_runner.ConvexIngestClient,
        "post",
        lambda _self, path, payload: calls.append((path, payload)),
    )
    monkeypatch.setattr(
        ingest_runner.ConvexIngestClient,
        "activate_release",
        lambda _self, payload: calls.append(("/ingest/activate", payload)),
    )


def _gate_ingest(monkeypatch, total: int, fail: int, calls):
    sources = [
        ManSource(path=f"/usr/share/man/man1/p{i}.1", name=f"p{i}", section="1")
        for i in range(total)
    ]
    outcomes = {f"p{i}" for i in range(total - fail, total)}
    _install_gate_harness(monkeypatch, sources, outcomes, calls)
    return ingest_runner.ingest(
        sample=False,
        activate=True,
        convex_url="https://example.convex.site",
        ingest_secret="s",
        dataset_stage="staging",
        image_ref="t",
        image_digest="t",
        git_sha="t",
    )


def test_publish_gate_blocks_at_020_hard_fail(monkeypatch) -> None:
    calls: list = []
    # success_rate is exactly 1 - hard_fail_rate (every source lands in one
    # bucket), so the 0.80 success gate can never bind alone: hard 0.20 means
    # success 0.80 and is still blocked by the hard-fail gate.
    with pytest.raises(RuntimeError, match="publish blocked"):
        _gate_ingest(monkeypatch, total=25, fail=5, calls=calls)
    assert not any(route == "/ingest/activate" for route, _ in calls)


def test_publish_gate_allows_exactly_002_hard_fail(monkeypatch) -> None:
    calls: list = []
    # 2 failures of 100 → hard_fail_rate exactly 0.02.
    result = _gate_ingest(monkeypatch, total=100, fail=2, calls=calls)
    assert result.published


def test_publish_gate_blocks_above_002_hard_fail(monkeypatch) -> None:
    calls: list = []
    with pytest.raises(RuntimeError, match="publish blocked"):
        _gate_ingest(monkeypatch, total=100, fail=3, calls=calls)
    assert not any(route == "/ingest/activate" for route, _ in calls)


def test_publish_gate_blocks_below_080_success(monkeypatch) -> None:
    calls: list = []
    with pytest.raises(RuntimeError, match="publish blocked"):
        _gate_ingest(monkeypatch, total=25, fail=6, calls=calls)


def test_fedora_chunk_mismatch_falls_back_to_per_file(monkeypatch, caplog) -> None:
    paths = [Path("/usr/share/man/man1/owned.1"), Path("/usr/share/man/man1/unowned.1")]

    def fake_run(cmd, **_kwargs):
        files = [a for a in cmd if a.startswith("/usr/share/man/")]
        if len(files) == 2:
            # Desynced chunk: one line for two files.
            return subprocess.CompletedProcess(cmd, 0, stdout="pkgA\n", stderr="")
        if files == ["/usr/share/man/man1/owned.1"]:
            return subprocess.CompletedProcess(cmd, 0, stdout="pkgA\n", stderr="")
        return subprocess.CompletedProcess(cmd, 1, stdout="", stderr="not owned")

    monkeypatch.setattr("ingestion.fedora.subprocess.run", fake_run)
    with caplog.at_level("WARNING", logger="betterman.ingestion"):
        mapping = build_manpath_to_package(paths)
    assert mapping == {"/usr/share/man/man1/owned.1": "pkgA"}
    assert any("unowned.1" in rec.message for rec in caplog.records)
