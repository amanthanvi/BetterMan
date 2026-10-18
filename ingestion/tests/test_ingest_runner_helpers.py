from __future__ import annotations

import gzip
import hashlib
import shutil
from concurrent.futures import ProcessPoolExecutor
from concurrent.futures.process import BrokenProcessPool
from dataclasses import replace
from pathlib import Path

import pytest

from ingestion import ingest_runner
from ingestion.convex_client import ConvexContractError, ConvexIngestClient, encode_json
from ingestion.ingest_runner import (
    _AliasRow,
    _build_page_links,
    _content_packages,
    _filter_sources,
    _ingest_worker_count,
    _iter_internal_doc_links,
    _page_batch_limits,
    _page_batches,
    _page_payload,
    _PageRow,
    _parse_man_href,
    _parse_sources,
    _ParseContext,
    _resolve_aliases,
    _upload_pages,
)
from ingestion.man_scan import ManSource

_ROFF = Path(__file__).parent / "fixtures" / "roff"


def test_filter_sources_dedupes_and_normalizes() -> None:
    sources = [
        ManSource(path="/usr/share/man/man1/FOO.1.gz", name="FOO", section="1"),
        ManSource(path="/usr/share/man/man1/foo.1", name="foo", section="1"),
        ManSource(path="/usr/share/man/man1/invalid name.1", name="invalid name", section="1"),
        ManSource(path="/usr/share/man/man1/back\\slash.1", name="back\\slash", section="1"),
        ManSource(path="/usr/share/man/man5/bar.5", name="bar", section="5"),
    ]

    filtered = _filter_sources(sources)
    assert [(s.name, s.section) for s in filtered] == [("foo", "1"), ("bar", "5")]


@pytest.mark.parametrize(
    ("value", "expected"), [("1", 1), ("3", 3), (" 4 ", 4), ("0", 1), ("-2", 1), ("64", 8)]
)
def test_ingest_worker_count_is_clamped(monkeypatch, value: str, expected: int) -> None:
    monkeypatch.setenv("BETTERMAN_INGEST_WORKERS", value)
    assert _ingest_worker_count() == expected


def test_ingest_worker_count_defaults_to_cpus_up_to_eight(monkeypatch) -> None:
    monkeypatch.delenv("BETTERMAN_INGEST_WORKERS", raising=False)
    monkeypatch.setattr(ingest_runner.os, "cpu_count", lambda: 32)
    assert _ingest_worker_count() == 8
    monkeypatch.setattr(ingest_runner.os, "cpu_count", lambda: None)
    assert _ingest_worker_count() == 1
    monkeypatch.setenv("BETTERMAN_INGEST_WORKERS", "many")
    with pytest.raises(RuntimeError, match="BETTERMAN_INGEST_WORKERS"):
        _ingest_worker_count()


def test_broken_parse_pool_names_the_first_source_without_a_result(monkeypatch) -> None:
    class DyingPool:
        def __init__(self, **_kwargs) -> None:
            pass

        def __enter__(self):
            return self

        def __exit__(self, *_exc) -> None:
            return None

        def map(self, _fn, _sources):
            yield ingest_runner._ParseResult(error="first")
            raise BrokenProcessPool("terminated abruptly")

    monkeypatch.setattr(ingest_runner, "ProcessPoolExecutor", DyingPool)
    sources = [ManSource(path=Path(f"/man/p{i}.1"), name=f"p{i}", section="1") for i in range(3)]
    context = _ParseContext(distro="debian", arch="amd64", packages={}, manpath_to_pkg={})
    with pytest.raises(RuntimeError, match=r"before source 2 of 3 \(/man/p1\.1\)"):
        list(ingest_runner._parse_results(sources, context, workers=2))


@pytest.mark.skipif(shutil.which("mandoc") is None, reason="mandoc not installed")
def test_parallel_parse_matches_sequential(monkeypatch, tmp_path: Path) -> None:
    pools: list[int] = []

    class RecordingPool(ProcessPoolExecutor):
        def __init__(self, **kwargs) -> None:
            pools.append(kwargs["max_workers"])
            super().__init__(**kwargs)

    monkeypatch.setattr(ingest_runner, "ProcessPoolExecutor", RecordingPool)
    gz = tmp_path / "ls.1.GZ"
    gz.write_bytes(gzip.compress((_ROFF / "ls.1").read_bytes()))
    sources = [
        ManSource(path=_ROFF / "ascii.7", name="ascii", section="7"),
        ManSource(path=gz, name="ls", section="1"),
        ManSource(path=_ROFF / "man.7", name="man", section="7"),
        ManSource(path=tmp_path / "missing.1", name="missing", section="1"),
        ManSource(path=_ROFF / "ssh_config.5", name="ssh_config", section="5"),
        ManSource(path=_ROFF / "tar.1", name="tar", section="1"),
    ]
    context = _ParseContext(
        distro="debian",
        arch="amd64",
        packages={"tar": "1.35"},
        manpath_to_pkg={str(_ROFF / "tar.1"): "tar"},
    )

    sequential = _parse_sources(sources, context, workers=1)
    parallel = _parse_sources(sources, context, workers=4)

    assert pools == [4]
    assert parallel == sequential
    pages, aliases, failed = sequential
    assert [(p.name, p.section) for p in pages] == [
        ("ascii", "7"),
        ("ls", "1"),
        ("ssh_config", "5"),
        ("tar", "1"),
    ]
    assert pages[1].content_sha256 == hashlib.sha256((_ROFF / "ls.1").read_bytes()).hexdigest()
    assert pages[3].page_id == hashlib.sha256(b"debian/tar/1").hexdigest()[:32]
    assert pages[3].source_package_version == "1.35"
    assert [(a.name, a.target_name) for a in aliases] == [("man", "groff_man")]
    assert failed == 1


def test_content_packages_dedupes_base_packages() -> None:
    pkgs = _content_packages(sample=True, distro="debian")
    assert pkgs[:2] == ["mandoc", "man-db"]
    assert len(set(pkgs)) == len(pkgs)


def test_content_packages_arch_avoids_man_db_conflict() -> None:
    pkgs = _content_packages(sample=True, distro="arch")
    assert pkgs[0] == "mandoc"
    assert "man-db" not in pkgs
    assert len(set(pkgs)) == len(pkgs)


def test_content_packages_alpine_avoids_man_db_conflict() -> None:
    pkgs = _content_packages(sample=True, distro="alpine")
    assert pkgs[0] == "mandoc"
    assert "man-db" not in pkgs
    assert len(set(pkgs)) == len(pkgs)


def test_content_packages_include_tar_for_golden_checks() -> None:
    for distro in ["debian", "ubuntu", "fedora", "arch", "alpine"]:
        assert "tar" in _content_packages(sample=False, distro=distro)


def test_parse_man_href_supports_extended_sections() -> None:
    assert _parse_man_href("/man/openssl/1ssl") == ("openssl", "1ssl")
    assert _parse_man_href("/man/curl/1") == ("curl", "1")
    assert _parse_man_href("/man/curl") == ("curl", None)
    assert _parse_man_href("https://example.com/man/curl/1") is None
    assert _parse_man_href("/man/back\\slash/1") is None


def test_iter_internal_doc_links_yields_nested_links() -> None:
    doc = {
        "blocks": [
            {
                "type": "paragraph",
                "inlines": [
                    {"type": "text", "text": "See "},
                    {"type": "link", "href": "/man/foo/1", "linkType": "internal"},
                ],
            }
        ]
    }

    links = list(_iter_internal_doc_links(doc))
    assert len(links) == 1
    assert links[0]["href"] == "/man/foo/1"


def test_build_page_links_returns_xref_and_see_also_payloads() -> None:
    foo_id = "foo-id"
    bar1_id = "bar1-id"
    bar5_id = "bar5-id"
    baz_id = "baz-id"

    foo_doc = {
        "blocks": [
            {
                "type": "paragraph",
                "inlines": [
                    {"type": "link", "href": "/man/bar/1", "linkType": "internal"},
                    {"type": "link", "href": "/man/baz", "linkType": "internal"},
                    {"type": "link", "href": "/man/bar", "linkType": "internal"},
                ],
            }
        ]
    }

    pages = [
        _PageRow(
            page_id=foo_id,
            name="foo",
            section="1",
            title="foo(1)",
            description="",
            source_path="/usr/share/man/man1/foo.1.gz",
            source_package=None,
            source_package_version=None,
            content_sha256="x",
            has_parse_warnings=False,
            doc=foo_doc,
            plain_text="",
            synopsis=None,
            options=None,
            see_also=[
                {"name": "bar", "section": "1", "resolvedPageId": bar1_id},
                {"name": "bar", "section": "1", "resolvedPageId": bar1_id},
            ],
            headings_text="",
            see_also_refs=[],
        ),
        _PageRow(
            page_id=bar1_id,
            name="bar",
            section="1",
            title="bar(1)",
            description="",
            source_path="/usr/share/man/man1/bar.1.gz",
            source_package=None,
            source_package_version=None,
            content_sha256="y",
            has_parse_warnings=False,
            doc={"blocks": []},
            plain_text="",
            synopsis=None,
            options=None,
            see_also=None,
            headings_text="",
            see_also_refs=[],
        ),
        _PageRow(
            page_id=bar5_id,
            name="bar",
            section="5",
            title="bar(5)",
            description="",
            source_path="/usr/share/man/man5/bar.5.gz",
            source_package=None,
            source_package_version=None,
            content_sha256="z",
            has_parse_warnings=False,
            doc={"blocks": []},
            plain_text="",
            synopsis=None,
            options=None,
            see_also=None,
            headings_text="",
            see_also_refs=[],
        ),
        _PageRow(
            page_id=baz_id,
            name="baz",
            section="1",
            title="baz(1)",
            description="",
            source_path="/usr/share/man/man1/baz.1.gz",
            source_package=None,
            source_package_version=None,
            content_sha256="w",
            has_parse_warnings=False,
            doc={"blocks": []},
            plain_text="",
            synopsis=None,
            options=None,
            see_also=None,
            headings_text="",
            see_also_refs=[],
        ),
    ]

    links_by_page = _build_page_links(pages=pages)
    links = links_by_page[foo_id]

    link_types = [link["linkType"] for link in links]
    assert link_types.count("see_also") == 1
    assert link_types.count("xref") == 2
    assert {
        "toExternalId": bar1_id,
        "toName": "bar",
        "toSection": "1",
        "linkType": "see_also",
    } in links


def _page(name: str, section: str) -> _PageRow:
    return _PageRow(
        page_id=f"{name}.{section}",
        name=name,
        section=section,
        title=f"{name}({section})",
        description="",
        source_path=f"/usr/share/man/man{section}/{name}.{section}",
        source_package=None,
        source_package_version=None,
        content_sha256="x",
        has_parse_warnings=False,
        doc={"toc": [], "blocks": []},
        plain_text="",
        synopsis=None,
        options=None,
        see_also=None,
        headings_text="",
        see_also_refs=[],
    )


def _alias(name: str, target: str) -> _AliasRow:
    return _AliasRow(
        name=name,
        section="1",
        target_name=target,
        target_section="1",
        source_path=f"/usr/share/man/man1/{name}.1",
    )


def test_resolve_aliases_follows_long_chains_and_drops_cycles() -> None:
    pages = [_page("real", "1")]
    chain = [_alias(f"s{i}", f"s{i + 1}") for i in range(12)] + [_alias("s12", "real")]
    aliases = [
        *chain,
        _alias("loop1", "loop2"),
        _alias("loop2", "loop1"),
        _alias("dangling", "missing"),
    ]

    resolved = _resolve_aliases(aliases=aliases, pages=pages)

    assert [a.name for a in resolved] == [f"s{i}" for i in range(13)]
    assert {a.target_name for a in resolved} == {"real"}


@pytest.mark.parametrize("with_alias_and_license", [False, True])
def test_ingest_declares_uploaded_aliases_and_licenses(monkeypatch, with_alias_and_license):
    pages = [_page("real", "1")]
    sources = [ManSource(path=pages[0].source_path, name="real", section="1")]
    if with_alias_and_license:
        sources.append(ManSource(path="/usr/share/man/man1/stub.1", name="stub", section="1"))
    monkeypatch.setattr(ingest_runner, "apt_install", lambda _packages: None)
    monkeypatch.setattr(ingest_runner, "scan_man_sources", lambda *_args, **_kwargs: sources)
    monkeypatch.setattr(ingest_runner, "dpkg_packages", lambda: {"example": "1.0"})
    monkeypatch.setattr(ingest_runner, "dpkg_arch", lambda: "amd64")
    monkeypatch.setattr(ingest_runner, "mandoc_pkg_version_dpkg", lambda _packages: "1.0")
    monkeypatch.setattr(ingest_runner, "build_manpath_to_package_dpkg", lambda: {})
    # Monkeypatches do not reach spawn or forkserver worker processes.
    monkeypatch.setenv("BETTERMAN_INGEST_WORKERS", "1")
    monkeypatch.setattr(ingest_runner, "read_roff", lambda _path: b"")
    monkeypatch.setattr(ingest_runner, "_parse_source", lambda *_args, **_kwargs: pages[0])
    monkeypatch.setattr(
        ingest_runner,
        "_alias_for_source",
        lambda source, _raw: _alias("stub", "real") if source.name == "stub" else None,
    )
    monkeypatch.setattr(
        ingest_runner,
        "_collect_licenses",
        lambda **_kwargs: {"example": "Copyright example"} if with_alias_and_license else {},
    )
    calls = []
    events = []
    monkeypatch.setattr(
        ingest_runner.ConvexIngestClient,
        "require_deployed_contract",
        lambda _self: events.append("contract") or {"schemaVersion": 1},
    )

    def post(_self, path, payload):
        events.append("write")
        calls.append((path, payload))

    def activate(_self, payload):
        events.append("write")
        calls.append(("/ingest/activate", payload))

    monkeypatch.setattr(ingest_runner.ConvexIngestClient, "post", post)
    monkeypatch.setattr(ingest_runner.ConvexIngestClient, "activate_release", activate)

    result = ingest_runner.ingest(
        sample=True,
        activate=True,
        convex_url="https://example.convex.site",
        ingest_secret="test-secret",
        dataset_stage="staging",
        image_ref="test",
        image_digest="test",
        git_sha="test",
    )

    assert events[0] == "contract"
    assert events.index("contract") < events.index("write")
    declaration = calls[0][1]
    assert calls[0][0] == "/ingest/release"
    assert declaration["pageCount"] == 1
    assert declaration["sectionTotals"] == [{"section": "1", "total": 1}]
    assert declaration["aliasCount"] == int(with_alias_and_license)
    assert declaration["licenseCount"] == int(with_alias_and_license)
    assert declaration["licensePackages"] == [
        {"name": "example", "version": "1.0", "hasLicenseText": with_alias_and_license}
    ]
    for path, key in [("/ingest/aliases", "aliases"), ("/ingest/licenses", "licenses")]:
        assert sum(len(payload[key]) for route, payload in calls if route == path) == int(
            with_alias_and_license
        )
    assert calls[-1][0] == "/ingest/activate"
    assert result.published


def test_page_payload_sends_only_what_the_server_stores() -> None:
    row = replace(_page("real", "1"), description="desc", plain_text="word " * 100)
    payload = _page_payload(row, sitemap_page=1, links=[])
    assert payload["searchText"] == ""
    assert len(payload["snippetText"]) == 240
    assert payload["snippetText"].startswith("desc word word")


def test_page_batches_bound_items_and_exact_request_bytes() -> None:
    pages: list[dict[str, object]] = [
        {"externalId": f"p{i}", "doc": {"text": "é" * 10}} for i in range(5)
    ]
    request = lambda batch: encode_json({"datasetReleaseId": "r", "pages": batch})  # noqa: E731
    two = len(request(pages[:2]))

    batches = list(_page_batches(pages, dataset_release_id="r", max_items=20, max_bytes=two))
    assert [len(batch) for batch in batches] == [2, 2, 1]
    assert [len(request(batch)) for batch in batches[:2]] == [two, two]
    assert [page for batch in batches for page in batch] == pages

    singles = _page_batches(pages, dataset_release_id="r", max_items=20, max_bytes=two - 1)
    assert [len(batch) for batch in singles] == [1, 1, 1, 1, 1]
    capped = _page_batches(pages, dataset_release_id="r", max_items=3, max_bytes=10**9)
    assert [len(batch) for batch in capped] == [3, 2]
    # A page above the budget is posted alone rather than dropped.
    oversized = _page_batches(pages, dataset_release_id="r", max_items=20, max_bytes=1)
    assert [len(batch) for batch in oversized] == [1, 1, 1, 1, 1]


def test_page_batch_limits_come_from_the_environment(monkeypatch) -> None:
    monkeypatch.delenv("BETTERMAN_INGEST_PAGE_BATCH_ITEMS", raising=False)
    monkeypatch.delenv("BETTERMAN_INGEST_PAGE_BATCH_BYTES", raising=False)
    assert _page_batch_limits() == (20, 8 * 1024 * 1024)
    monkeypatch.setenv("BETTERMAN_INGEST_PAGE_BATCH_ITEMS", "7")
    monkeypatch.setenv("BETTERMAN_INGEST_PAGE_BATCH_BYTES", "1024")
    assert _page_batch_limits() == (7, 1024)
    for value in ["0", "-1", "abc", "1.5"]:
        monkeypatch.setenv("BETTERMAN_INGEST_PAGE_BATCH_ITEMS", value)
        with pytest.raises(RuntimeError, match="BETTERMAN_INGEST_PAGE_BATCH_ITEMS must be"):
            _page_batch_limits()


def _upload_batches_of_one(monkeypatch, post, posted: list[str]) -> None:
    def record(_self, path, payload):
        name = payload["pages"][0]["name"]
        posted.append(name)
        return post(name)

    monkeypatch.setattr(ingest_runner.ConvexIngestClient, "post", record)
    pages: list[dict[str, object]] = [{"name": f"p{i}", "section": "1"} for i in range(5)]
    _upload_pages(
        ConvexIngestClient("https://example.convex.site", "s"),
        dataset_release_id="r",
        limits=(1, 8 * 1024 * 1024),
        pages=pages,
    )


def test_upload_pages_aborts_after_three_consecutive_failed_batches(monkeypatch) -> None:
    def outage(_name):
        raise RuntimeError("Convex ingest HTTP 503: outage")

    posted: list[str] = []
    with pytest.raises(RuntimeError, match="3 consecutive failed batches"):
        _upload_batches_of_one(monkeypatch, outage, posted)
    assert posted == ["p0", "p1", "p2"]


def test_upload_pages_tries_every_batch_then_fails_on_a_rejected_one(monkeypatch) -> None:
    def reject_second(name):
        if name == "p1":
            raise RuntimeError("Convex ingest HTTP 409: DUPLICATE_MAN_PAGE_ROUTE")
        return {"inserted": 1, "skipped": 0}

    posted: list[str] = []
    with pytest.raises(RuntimeError, match="1 page batch"):
        _upload_batches_of_one(monkeypatch, reject_second, posted)
    assert posted == ["p0", "p1", "p2", "p3", "p4"]


def test_ingest_fails_before_writing_when_convex_contract_is_missing(monkeypatch):
    def missing(_self):
        raise ConvexContractError("GET /ingest/contract returned 404")

    monkeypatch.setattr(ingest_runner.ConvexIngestClient, "require_deployed_contract", missing)
    calls = []
    monkeypatch.setattr(
        ingest_runner.ConvexIngestClient,
        "post",
        lambda *_args, **_kwargs: calls.append("post"),
    )
    monkeypatch.setattr(ingest_runner, "apt_install", lambda _packages: calls.append("apt"))

    with pytest.raises(ConvexContractError, match="404"):
        ingest_runner.ingest(
            sample=True,
            activate=True,
            convex_url="https://example.convex.site",
            ingest_secret="test-secret",
            dataset_stage="staging",
            image_ref="test",
            image_digest="test",
            git_sha="test",
        )

    assert calls == []
