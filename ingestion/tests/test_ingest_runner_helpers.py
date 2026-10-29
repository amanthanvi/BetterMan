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
from ingestion.convex_client import (
    REQUIRED_DECLARATION_COUNTS,
    REQUIRED_FUNCTIONS,
    REQUIRED_SCHEMA_VERSION,
    ConvexContractError,
    ConvexIngestClient,
    encode_json,
)
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
from ingestion.mandoc_parser import parse_mandoc_html

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

        def submit(self, _fn, source):
            from concurrent.futures import Future

            future = Future()
            if source.name == "p0":
                future.set_result(ingest_runner._ParseResult(error="first"))
            else:
                future.set_exception(BrokenProcessPool("terminated abruptly"))
            return future

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


def test_content_packages_include_the_man7_stub_target() -> None:
    # man-pages' man.7 is `.so man7/groff_man.7`; the target is in groff, not groff-base.
    for distro in ["debian", "ubuntu", "fedora", "arch"]:
        assert "groff" in _content_packages(sample=False, distro=distro)
    assert "mandoc-doc" in _content_packages(sample=False, distro="alpine")


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
@pytest.mark.parametrize("missing_command", [False, True])
@pytest.mark.parametrize("oversize_license", [False, True])
@pytest.mark.parametrize("allow_missing", [False, True])
def test_ingest_declares_uploaded_aliases_and_licenses(
    monkeypatch, with_alias_and_license, missing_command, oversize_license, allow_missing
):
    monkeypatch.setenv("BETTERMAN_ALLOW_MISSING_COMMAND_PAGES", "1" if allow_missing else "0")
    pages = [_page("real" if missing_command else "tar", "1")]
    monkeypatch.setattr(ingest_runner, "_content_packages", lambda **_kwargs: ["tar"])
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
        lambda source, _raw: _alias("stub", pages[0].name) if source.name == "stub" else None,
    )
    monkeypatch.setattr(
        ingest_runner,
        "_collect_licenses",
        lambda **_kwargs: (
            {"example": "é" * (1024 * 1024)}
            if oversize_license
            else ({"example": "Copyright example"} if with_alias_and_license else {})
        ),
    )
    calls = []
    events = []
    monkeypatch.setattr(
        ingest_runner.ConvexIngestClient,
        "require_deployed_contract",
        lambda _self: events.append("contract") or {"schemaVersion": REQUIRED_SCHEMA_VERSION},
    )

    def post(_self, path, payload):
        events.append("write")
        calls.append((path, payload))

    def activate(_self, payload):
        events.append("write")
        calls.append(("/ingest/activate", payload))

    monkeypatch.setattr(ingest_runner.ConvexIngestClient, "post", post)
    monkeypatch.setattr(ingest_runner.ConvexIngestClient, "activate_release", activate)

    if (missing_command and not allow_missing) or oversize_license:
        error = (
            r"missing package-set command pages: tar\(1\)"
            if missing_command and not allow_missing
            else "license document exceeds Convex 1 MiB limit"
        )
        with pytest.raises(RuntimeError, match=error):
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
        assert events == ["contract"]
        return

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
    assert declaration["packageManifest"]["commandPageCheck"] == {
        "allowMissingCommandPages": allow_missing,
        "allowedMissingPages": (
            [{"name": "tar", "section": "1", "package": "tar", "ownerPackage": "tar"}]
            if missing_command
            else []
        ),
    }
    assert declaration["pageCount"] == 1
    assert declaration["sectionTotals"] == [{"section": "1", "total": 1}]
    assert declaration["aliasCount"] == int(with_alias_and_license)
    assert declaration["licenseCount"] == int(with_alias_and_license)
    packages = [{"name": "example", "version": "1.0", "hasLicenseText": with_alias_and_license}]
    assert declaration["packageBatches"] == [
        {
            "digest": ingest_runner._package_batch_digest(packages),
            "count": 1,
            "licenseCount": int(with_alias_and_license),
        }
    ]
    assert (
        "/ingest/license-packages",
        {
            "datasetReleaseId": result.dataset_release_id,
            "batchIndex": 0,
            "packages": packages,
        },
    ) in calls
    for path, key in [("/ingest/aliases", "aliases"), ("/ingest/licenses", "licenses")]:
        assert sum(len(payload[key]) for route, payload in calls if route == path) == int(
            with_alias_and_license
        )
    assert calls[-1][0] == "/ingest/activate"
    assert result.published


def test_page_payload_sends_only_what_the_server_stores() -> None:
    from ingestion.extractor_provenance import OPTION_EXTRACTOR_VERSION

    row = replace(_page("real", "1"), description="desc", plain_text="word " * 100)
    payload = _page_payload(row, sitemap_page=1, links=[])
    assert payload["searchText"] == ""
    assert len(payload["snippetText"]) == 240
    assert payload["snippetText"].startswith("desc word word")
    assert payload["extractorVersion"] == OPTION_EXTRACTOR_VERSION


def test_page_payload_keeps_definition_opening_in_options_and_search_snippet() -> None:
    parsed = parse_mandoc_html("""<div class="manual-text"><h1>OPTIONS</h1><dl>
      <dt id="f">-f</dt><dd>Use archive file or device <i>ARCHIVE</i>.
      Examine <code>TAPE</code> first.<p>A later paragraph.</p></dd></dl></div>""")
    row = replace(
        _page("tar", "1"),
        doc=parsed.doc.model_dump(),
        plain_text=parsed.plain_text,
        options=[option.model_dump() for option in parsed.options or []],
    )
    payload = _page_payload(row, sitemap_page=1, links=[])
    assert payload["options"][0]["description"] == (
        "Use archive file or device ARCHIVE. Examine TAPE first. A later paragraph."
    )
    assert payload["options"][0]["anchorId"] == "f"
    assert "Use archive file or device" in payload["snippetText"]
    assert "TAPE" in payload["snippetText"]


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


def test_ingest_rejects_the_license_batch_v2_contract_before_any_write(monkeypatch):
    monkeypatch.setattr(
        ingest_runner.ConvexIngestClient,
        "_get_json",
        lambda _self, _path: {
            "schemaVersion": 2,
            "functions": list(REQUIRED_FUNCTIONS),
            "declarationCounts": list(REQUIRED_DECLARATION_COUNTS),
            "activatePending": True,
        },
    )
    calls = []
    monkeypatch.setattr(
        ingest_runner.ConvexIngestClient,
        "post",
        lambda *_args, **_kwargs: calls.append("post"),
    )
    monkeypatch.setattr(ingest_runner, "apt_install", lambda _packages: calls.append("apt"))
    with pytest.raises(ConvexContractError, match="schemaVersion 2"):
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


@pytest.mark.parametrize("distro", ["fedora", "arch", "alpine"])
def test_collect_linux_license_files(monkeypatch, tmp_path, distro) -> None:
    if distro == "fedora":
        monkeypatch.setattr(ingest_runner, "_rpm_license_files", lambda: {})
    root = tmp_path / "licenses"
    (root / "example" / "nested").mkdir(parents=True)
    (root / "example" / "COPYING").write_text("Copyright example")
    (root / "example" / "nested" / "NOTICE").write_text("Attribution example")
    monkeypatch.setattr(ingest_runner, "_LICENSE_ROOT", root)
    pkg = "example-doc" if distro == "alpine" else "example"
    row = replace(_page("real", "1"), source_package=pkg)
    licenses = ingest_runner._collect_licenses(pages=[row], distro=distro)
    assert "Copyright example" in licenses[pkg]
    assert "Attribution example" in licenses[pkg]


def test_license_files_are_confined_to_license_root(monkeypatch, tmp_path) -> None:
    root = tmp_path / "licenses"
    (root / "example").mkdir(parents=True)
    secret = tmp_path / "secret"
    secret.write_text("must not publish")
    (root / "example" / "COPYING").symlink_to(secret)
    (root / "outside").symlink_to(tmp_path, target_is_directory=True)
    monkeypatch.setattr(ingest_runner, "_LICENSE_ROOT", root)
    for pkg in ["example", "outside", "../secret", "missing"]:
        assert ingest_runner._read_package_licenses(pkg) is None


@pytest.mark.parametrize("distro", ["arch", "alpine"])
def test_collect_shared_spdx_licenses(monkeypatch, tmp_path, distro) -> None:
    root = tmp_path / "licenses"
    spdx = root / "spdx"
    spdx.mkdir(parents=True)
    (spdx / "GPL-3.0-or-later.txt").write_text("GNU General Public License")
    monkeypatch.setattr(ingest_runner, "_LICENSE_ROOT", root)
    monkeypatch.setattr(ingest_runner, "_ALPINE_SPDX_ROOT", spdx)
    monkeypatch.setattr(
        ingest_runner, "pacman_license_ids", lambda: {"example": "GPL-3.0-or-later"}
    )
    monkeypatch.setattr(ingest_runner, "apk_license_ids", lambda: {"example": "GPL-3.0-or-later"})
    assert (
        "GNU General Public License"
        in ingest_runner._collect_licenses(
            pages=[replace(_page("tar", "1"), source_package="example")], distro=distro
        )["example"]
    )


def test_spdx_license_paths_are_confined(monkeypatch, tmp_path) -> None:
    root = tmp_path / "licenses"
    root.mkdir()
    secret = tmp_path / "secret"
    secret.write_text("must not publish")
    (root / "MIT.txt").symlink_to(secret)
    assert ingest_runner._read_spdx_licenses("MIT OR ../secret", root=root) is None


@pytest.mark.parametrize("distro", ["freebsd", "macos"])
def test_base_pages_record_version_and_provenance(monkeypatch, distro) -> None:
    monkeypatch.setattr(
        ingest_runner,
        "render_html",
        lambda _raw: type(
            "HTML",
            (),
            {
                "html": '<div class="manual-text"><h1>NAME</h1><p>example</p></div>',
                "warnings": None,
            },
        )(),
    )
    package = f"{distro}-base"
    context = _ParseContext(
        distro=distro, arch="arm64", packages={package: "15.1"}, manpath_to_pkg={}
    )
    base = ingest_runner._parse_source(
        ManSource(path=Path("/usr/share/man/man1/example.1"), name="example", section="1"),
        b"source",
        context,
    )
    assert base.source_package == package
    assert base.source_package_version == "15.1"
    license_text = ingest_runner._collect_licenses(pages=[base], distro=distro)[package]
    assert "base-system" in license_text
    assert "15.1" in license_text
    assert "https://" in license_text
    port = ingest_runner._parse_source(
        ManSource(path=Path("/usr/local/share/man/man1/example.1"), name="example", section="1"),
        b"source",
        context,
    )
    assert port.source_package is None


def test_command_page_check_accepts_resolved_aliases_and_limits_samples() -> None:
    ingest_runner._require_command_pages(
        distro="debian",
        requested=["tar", "git", "manpages"],
        pages=[_page("gtar", "1")],
        aliases=[_alias("tar", "gtar")],
        sample=True,
    )
    ingest_runner._require_command_pages(
        distro="debian",
        requested=["openssl"],
        pages=[_page("openssl", "1ssl")],
        aliases=[],
        sample=False,
    )
    with pytest.raises(RuntimeError, match=r"git\(1\)"):
        ingest_runner._require_command_pages(
            distro="debian",
            requested=["git"],
            pages=[],
            aliases=[],
            sample=False,
        )


@pytest.mark.parametrize(
    "package",
    [
        "python3",
        "python",
        "netcat-openbsd",
        "httpd",
        "systemd",
        "iproute2",
        "postgresql-client",
    ],
)
def test_release_requires_each_command_package_page(package) -> None:
    with pytest.raises(RuntimeError, match="missing package-set command pages"):
        ingest_runner._require_command_pages(
            distro="debian", requested=[package], pages=[], aliases=[], sample=False
        )


def test_package_sets_classify_commands_and_non_command_packages() -> None:
    from ingestion.package_set import FULL_PACKAGE_SET_BY_DISTRO

    for distro in FULL_PACKAGE_SET_BY_DISTRO:
        requested = _content_packages(sample=False, distro=distro)
        assert (
            set(requested)
            <= ingest_runner._COMMAND_PAGES.keys() | ingest_runner._NON_COMMAND_PACKAGES
        )
    with pytest.raises(RuntimeError, match="no command-page expectation"):
        ingest_runner._require_command_pages(
            distro="debian", requested=["new-package"], pages=[], aliases=[], sample=False
        )


@pytest.mark.parametrize(
    ("distro", "command"), [("debian", "apache2"), ("ubuntu", "apache2"), ("alpine", "httpd")]
)
def test_apache_page_expectation_matches_distro(distro, command) -> None:
    ingest_runner._require_command_pages(
        distro=distro,
        requested=["apache2"],
        pages=[_page(command, "8")],
        aliases=[],
        sample=False,
    )
    with pytest.raises(RuntimeError, match=command):
        ingest_runner._require_command_pages(
            distro=distro,
            requested=["apache2"],
            pages=[],
            aliases=[],
            sample=False,
        )


def test_rpm_license_files_share_source_package_and_keep_mixed_case(monkeypatch, tmp_path):
    root = tmp_path / "licenses"
    doc = tmp_path / "doc"
    (root / "perl").mkdir(parents=True)
    doc.mkdir()
    license = root / "perl" / "COPYING"
    license.write_text("Perl license text")
    output = (
        f"perl-libs\tperl.src.rpm\t{license}\t128\n"
        "perl-IO-Socket\tperl.src.rpm\t/usr/bin/example\t0\n"
        "perl-doc\tperl.src.rpm\t/usr/share/man/perl.1\t2\n"
        f"perl-libs\tperl.src.rpm\t{root / 'perl' / 'NOTICE'}\t2\n"
    )
    monkeypatch.setattr(ingest_runner.subprocess, "check_output", lambda *a, **kw: output)
    monkeypatch.setattr(ingest_runner, "_LICENSE_ROOT", root)
    monkeypatch.setattr(ingest_runner, "_DOC_ROOT", doc)
    paths = ingest_runner._rpm_license_files()
    assert license in paths["perl-IO-Socket"]
    assert root / "perl" / "NOTICE" in paths["perl-IO-Socket"]
    assert paths["perl-doc"] == paths["perl-IO-Socket"]
    rows = [replace(_page("perl", "1"), source_package="perl-IO-Socket")]
    assert (
        "Perl license text"
        in ingest_runner._collect_licenses(pages=rows, distro="fedora")["perl-IO-Socket"]
    )
    (root / "Mixed-Case").mkdir()
    (root / "Mixed-Case" / "LICENSE").write_text("Mixed case license")
    assert "Mixed case license" in ingest_runner._read_package_licenses("Mixed-Case")


def test_rpm_license_paths_cannot_escape_roots(monkeypatch, tmp_path):
    root = tmp_path / "licenses"
    doc = tmp_path / "doc"
    root.mkdir()
    doc.mkdir()
    outside = tmp_path / "secret"
    outside.write_text("must not publish")
    link = root / "COPYING"
    link.symlink_to(outside)
    allowed = doc / "LICENSE"
    allowed.write_text("allowed license")
    monkeypatch.setattr(ingest_runner, "_LICENSE_ROOT", root)
    monkeypatch.setattr(ingest_runner, "_DOC_ROOT", doc)
    text = ingest_runner._read_rpm_license_files([link, outside, root / "missing", allowed])
    assert "allowed license" in text
    assert "must not publish" not in text


def test_license_items_measure_utf8_and_never_truncate():
    text = "é" * 300_000
    items = ingest_runner._license_items(
        licenses={"example": text}, distro="fedora", dataset_release_id="r"
    )
    assert items[0]["licenseText"] == text
    with pytest.raises(RuntimeError, match="package=example.*text is not truncated"):
        ingest_runner._license_items(
            licenses={"example": "é" * 600_000}, distro="fedora", dataset_release_id="r"
        )


def test_perl_names_scan_resolve_and_build_links(tmp_path):
    module = tmp_path / "Foo::Bar.3perl"
    module.write_text(".TH Foo::Bar 3perl\n.SH NAME\nFoo::Bar \\- example module\n")
    source = _filter_sources([ManSource(path=module, name="Foo::Bar", section="3perl")])
    assert source[0].name == "foo::bar"
    target = _page("foo::bar", "3perl")
    source_page = replace(
        _page("caller", "1"),
        doc={
            "blocks": [
                {
                    "type": "link",
                    "linkType": "internal",
                    "href": "/man/foo::bar/3perl",
                }
            ]
        },
    )
    assert ingest_runner._parse_man_href("/man/foo::bar/3perl") == ("foo::bar", "3perl")
    links = ingest_runner._build_page_links(pages=[source_page, target])
    assert links[source_page.page_id][0]["toExternalId"] == target.page_id
    assert links[source_page.page_id][0]["toName"] == "foo::bar"


def test_disk_spool_and_parallel_upload_keep_large_bodies_bounded(tmp_path):
    import tracemalloc
    from threading import Lock

    # 2k x 64KiB bodies exceed 128MiB; the allocator peak must stay below
    # 12MiB. A retained list or an unbounded executor queue fails this test.
    count = 2000
    tracemalloc.start()
    try:
        with ingest_runner._PageSpool(tmp_path / "pages.sqlite3") as spool:
            for i in range(count):
                spool.append(replace(_page(f"p{i}", "1"), doc={"text": "x" * 65536}))
            refs = list(spool.refs())
            produced = 0
            uploaded = 0
            max_ahead = 0
            lock = Lock()

            def pages():
                nonlocal produced, max_ahead
                for payload in ingest_runner._resolved_page_payloads(
                    spool, refs, ingest_runner._build_sitemap_page_map(pages=refs)
                ):
                    with lock:
                        produced += 1
                        max_ahead = max(max_ahead, produced - uploaded)
                    yield payload

            class Client:
                def post(self, _path, payload):
                    nonlocal uploaded
                    with lock:
                        uploaded += len(payload["pages"])

            _upload_pages(
                Client(),
                dataset_release_id="r",
                limits=(3, 1024 * 1024),
                pages=pages(),
                total=count,
                workers=4,
            )
            assert produced == uploaded == count
            assert max_ahead <= 4 * 3 + 1
            assert tracemalloc.get_traced_memory()[1] < 12 * 1024 * 1024
    finally:
        tracemalloc.stop()


def test_spooled_link_resolution_matches_the_in_memory_path(tmp_path):
    import copy
    from dataclasses import asdict

    pages = [
        replace(
            _page("source", "1"),
            doc={
                "inlines": [
                    {"type": "link", "href": "/man/foo::bar/3perl", "linkType": "internal"},
                    {"type": "link", "href": "/man/missing/1", "linkType": "internal"},
                ]
            },
            see_also=[{"name": "foo::bar", "section": None}],
        ),
        _page("foo::bar", "3perl"),
    ]
    expected_pages = copy.deepcopy(pages)
    ingest_runner._resolve_doc_links_and_see_also(pages=expected_pages)
    links = ingest_runner._build_page_links(pages=expected_pages)
    sitemap = ingest_runner._build_sitemap_page_map(pages=pages)
    expected = [
        _page_payload(p, sitemap_page=sitemap[p.page_id], links=links.get(p.page_id, []))
        for p in expected_pages
    ]
    with ingest_runner._PageSpool(tmp_path / "pages.sqlite3") as spool:
        for page in pages:
            spool.append(page)
        refs = list(spool.refs())
        assert list(ingest_runner._resolved_page_payloads(spool, refs, sitemap)) == expected
        # Reading/resolving a replay does not mutate the stored original bodies.
        assert asdict(next(iter(spool))) == {**asdict(pages[0]), "see_also_refs": []}
