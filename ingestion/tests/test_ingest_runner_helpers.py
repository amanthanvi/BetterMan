from __future__ import annotations

from uuid import uuid4

import pytest

from ingestion import ingest_runner
from ingestion.ingest_runner import (
    _AliasRow,
    _build_page_links,
    _content_packages,
    _filter_sources,
    _iter_internal_doc_links,
    _PageRow,
    _parse_man_href,
    _resolve_aliases,
)
from ingestion.man_scan import ManSource


def test_filter_sources_dedupes_and_normalizes() -> None:
    sources = [
        ManSource(path="/usr/share/man/man1/FOO.1.gz", name="FOO", section="1"),
        ManSource(path="/usr/share/man/man1/foo.1", name="foo", section="1"),
        ManSource(path="/usr/share/man/man1/invalid name.1", name="invalid name", section="1"),
        ManSource(path="/usr/share/man/man5/bar.5", name="bar", section="5"),
    ]

    filtered = _filter_sources(sources)
    assert [(s.name, s.section) for s in filtered] == [("foo", "1"), ("bar", "5")]


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
    foo_id = uuid4()
    bar1_id = uuid4()
    bar5_id = uuid4()
    baz_id = uuid4()

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
                {"name": "bar", "section": "1", "resolvedPageId": str(bar1_id)},
                {"name": "bar", "section": "1", "resolvedPageId": str(bar1_id)},
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
    links = links_by_page[str(foo_id)]

    link_types = [link["linkType"] for link in links]
    assert link_types.count("see_also") == 1
    assert link_types.count("xref") == 2
    assert {
        "toExternalId": str(bar1_id),
        "toName": "bar",
        "toSection": "1",
        "linkType": "see_also",
    } in links


def _page(name: str, section: str) -> _PageRow:
    return _PageRow(
        page_id=uuid4(),
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
    monkeypatch.setattr(ingest_runner, "_parse_source", lambda *_args, **_kwargs: pages[0])
    monkeypatch.setattr(
        ingest_runner,
        "_alias_for_source",
        lambda source: _alias("stub", "real") if source.name == "stub" else None,
    )
    monkeypatch.setattr(
        ingest_runner,
        "_collect_licenses",
        lambda **_kwargs: {"example": "Copyright example"} if with_alias_and_license else {},
    )
    calls = []
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
