from __future__ import annotations

import gzip
import json
import multiprocessing
import shutil
from dataclasses import asdict
from functools import partial
from pathlib import Path
from types import SimpleNamespace

import pytest

from ingestion import docker_runner, ingest_runner
from ingestion.man_scan import ManSource

_ROFF = Path(__file__).parent / "fixtures" / "roff"
_GOLDEN = Path(__file__).parent / "fixtures" / "golden"


@pytest.mark.parametrize("cpus, expected", [(None, 1), (1, 1), (4, 4), (16, 8)])
def test_default_workers_are_capped_by_cpu_count(monkeypatch, cpus, expected):
    monkeypatch.delenv("BETTERMAN_INGEST_WORKERS", raising=False)
    monkeypatch.setattr(ingest_runner.os, "cpu_count", lambda: cpus)
    assert ingest_runner._ingest_worker_count() == expected


@pytest.mark.parametrize("value", ["", "0", "-1", "1.5", "two", " 2", "+2"])
def test_invalid_workers_fail_before_package_install(monkeypatch, value):
    monkeypatch.setenv("BETTERMAN_INGEST_WORKERS", value)

    def unexpected_install(_packages):
        pytest.fail("invalid worker count reached package installation")

    monkeypatch.setattr(ingest_runner, "apt_install", unexpected_install)
    with pytest.raises(ValueError, match="BETTERMAN_INGEST_WORKERS must be a positive integer"):
        ingest_runner.ingest(
            sample=True,
            activate=False,
            convex_url="https://example.convex.site",
            ingest_secret="test",
            dataset_stage="staging",
            image_ref="test",
            image_digest="test",
            git_sha="test",
        )


def test_explicit_workers_and_sequential_mode(monkeypatch, tmp_path):
    monkeypatch.setenv("BETTERMAN_INGEST_WORKERS", "12")
    assert ingest_runner._ingest_worker_count() == 12

    def unexpected_pool(**_kwargs):
        pytest.fail("sequential parsing started child processes")

    monkeypatch.setattr(ingest_runner, "ProcessPoolExecutor", unexpected_pool)
    stub = tmp_path / "stub.1"
    stub.write_text(".so man1/real.1\n")
    pages, aliases, failed = ingest_runner._parse_sources(
        [ManSource(stub, "stub", "1")],
        packages={},
        manpath_to_pkg={},
        arch="amd64",
        workers=1,
    )
    assert pages == []
    assert [alias.target_name for alias in aliases] == ["real"]
    assert failed == 0


def _resolve_output(pages, aliases, failed):
    ingest_runner._resolve_doc_links_and_see_also(pages=pages)
    aliases = ingest_runner._resolve_aliases(aliases=aliases, pages=pages)
    return {
        "pages": [asdict(page) for page in pages],
        "aliases": [asdict(alias) for alias in aliases],
        "failed": failed,
        "links": ingest_runner._build_page_links(pages=pages),
        "sitemaps": ingest_runner._build_sitemap_page_map(pages=pages),
    }


@pytest.mark.skipif(shutil.which("mandoc") is None, reason="mandoc not installed")
def test_spawn_pool_matches_sequential_fixtures_aliases_errors_and_links(monkeypatch, tmp_path):
    # Exercise every checked-in roff source, including large bash/curl inputs
    # and both man(7) and mdoc forms. Reverse order to detect unordered output.
    sources = []
    for path in sorted(_ROFF.iterdir(), reverse=True):
        name, section = path.name.split(".")[:2]
        if path.name.endswith(".mdoc"):
            name += "_mdoc"
        sources.append(ManSource(path, name, section))
    stub = tmp_path / "real_alias.7.GZ"
    stub.write_bytes(gzip.compress(b".so man7/groff_man.7\n"))
    real = tmp_path / "groff_man.7"
    real.write_text(".TH GROFF_MAN 7\n.SH NAME\ngroff_man \\- real alias target\n")
    broken = tmp_path / "broken.1.gz"
    broken.write_bytes(b"\x1f\x8bnot gzip")
    sources.insert(1, ManSource(broken, "broken", "1"))
    sources.insert(2, ManSource(tmp_path / "missing.1", "missing", "1"))
    sources.extend([ManSource(stub, "real_alias", "7"), ManSource(real, "groff_man", "7")])
    context = {
        "packages": {"fixture:amd64": "2.0"},
        "manpath_to_pkg": {str(src.path): "fixture" for src in sources},
        "arch": "amd64",
    }
    sequential = ingest_runner._parse_sources(sources, **context, workers=1)
    monkeypatch.setattr(
        ingest_runner,
        "ProcessPoolExecutor",
        partial(ingest_runner.ProcessPoolExecutor, mp_context=multiprocessing.get_context("spawn")),
    )
    parallel = ingest_runner._parse_sources(sources, **context, workers=2)
    pages, aliases, failed = parallel
    assert failed == 2
    assert [p.name for p in pages] == [
        src.name for src in sources if src.name not in {"broken", "missing", "man", "real_alias"}
    ]
    assert [alias.name for alias in aliases] == ["man", "real_alias"]
    assert all(page.source_package == "fixture" for page in pages)
    assert all(page.source_package_version == "2.0" for page in pages)
    for page in pages:
        golden_path = _GOLDEN / f"{Path(page.source_path).name}.json"
        if not golden_path.exists():
            continue
        expected = json.loads(golden_path.read_text())
        assert {
            "description": page.description,
            "synopsis": page.synopsis,
            "seeAlso": page.see_also or [],
            "options": page.options or [],
            "doc": page.doc,
        } == expected
    assert _resolve_output(*parallel) == _resolve_output(*sequential)


def test_progress_counts_alias_milestones_and_emits_rate_eta(monkeypatch, tmp_path):
    stub = tmp_path / "stub.1"
    stub.write_text(".so man1/real.1\n")
    sources = [ManSource(stub, f"stub{i}", "1") for i in range(101)]
    events = []
    monkeypatch.setattr(
        ingest_runner, "_log", lambda event, **fields: events.append((event, fields))
    )
    _, aliases, failed = ingest_runner._parse_sources(
        sources, packages={}, manpath_to_pkg={}, arch="amd64", workers=1
    )
    assert len(aliases) == 101
    assert failed == 0
    progress = [fields for event, fields in events if event == "parse_progress"]
    assert [fields["processed"] for fields in progress] == [100, 101]
    assert [fields["aliases"] for fields in progress] == [100, 101]
    assert all(fields["sourcesPerSecond"] > 0 for fields in progress)
    assert progress[-1]["pct"] == 100.0
    assert progress[-1]["etaSeconds"] == 0


def test_parse_result_reads_each_source_only_once(monkeypatch, tmp_path):
    src = ManSource(tmp_path / "real.1", "real", "1")
    raw = b".TH REAL 1\n"
    reads = []
    renders = []
    monkeypatch.setattr(ingest_runner, "_read_bytes", lambda path: reads.append(path) or raw)
    monkeypatch.setattr(
        ingest_runner,
        "render_html",
        lambda data: (
            renders.append(data)
            or SimpleNamespace(
                html='<html><body><div class="manual-text"></div></body></html>', warnings=None
            )
        ),
    )
    result = ingest_runner._parse_source_result(src, ingest_runner._ParseContext({}, {}, "amd64"))
    assert result.page is not None
    assert result.error is None
    assert reads == [src.path]
    assert renders == [raw]
    assert result.page.content_sha256 == ingest_runner.sha256_hex(raw)


def test_docker_forwards_worker_override_by_name(monkeypatch):
    monkeypatch.setenv("BETTERMAN_INGEST_WORKERS", "3")
    monkeypatch.setattr(docker_runner, "_docker_network_exists", lambda _name: False)
    monkeypatch.setattr(docker_runner, "_image_digest", lambda _image: "sha256:test")
    monkeypatch.setattr(docker_runner.subprocess, "check_output", lambda *_a, **_k: "test\n")
    calls = []
    monkeypatch.setattr(
        docker_runner.subprocess,
        "run",
        lambda cmd, **_kwargs: calls.append(cmd) or SimpleNamespace(returncode=0),
    )
    assert docker_runner.run_ingest_container(sample=True, activate=False, distro="debian") == 0
    docker_run = next(cmd for cmd in calls if cmd[:2] == ["docker", "run"])
    index = docker_run.index("BETTERMAN_INGEST_WORKERS")
    assert docker_run[index - 1] == "-e"
    assert not any(part.startswith("BETTERMAN_INGEST_WORKERS=") for part in docker_run)
