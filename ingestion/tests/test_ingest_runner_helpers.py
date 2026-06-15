from __future__ import annotations

from uuid import uuid4

from ingestion.ingest_runner import (
    _build_page_links,
    _content_packages,
    _filter_sources,
    _iter_internal_doc_links,
    _PageRow,
    _parse_man_href,
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
