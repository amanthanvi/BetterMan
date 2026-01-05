from __future__ import annotations

from uuid import uuid4

from ingestion.ingest_runner import _PageRow, _resolve_doc_links_and_see_also


def test_resolve_doc_links_marks_missing_xrefs_unresolved() -> None:
    bar_id = uuid4()
    foo_id = uuid4()

    foo_doc = {
        "toc": [{"id": "name", "title": "NAME", "level": 2}],
        "blocks": [
            {
                "type": "paragraph",
                "inlines": [
                    {"type": "text", "text": "See "},
                    {
                        "type": "link",
                        "href": "/man/bar/1",
                        "inlines": [{"type": "text", "text": "bar(1)"}],
                        "linkType": "internal",
                    },
                    {"type": "text", "text": " and "},
                    {
                        "type": "link",
                        "href": "/man/missing/1",
                        "inlines": [{"type": "text", "text": "missing(1)"}],
                        "linkType": "internal",
                    },
                    {"type": "text", "text": "."},
                ],
            }
        ],
    }

    foo = _PageRow(
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
            {"name": "bar", "section": "1", "resolvedPageId": None},
            {"name": "missing", "section": "1", "resolvedPageId": None},
        ],
        headings_text="",
        see_also_refs=[],
    )

    bar = _PageRow(
        page_id=bar_id,
        name="bar",
        section="1",
        title="bar(1)",
        description="",
        source_path="/usr/share/man/man1/bar.1.gz",
        source_package=None,
        source_package_version=None,
        content_sha256="y",
        has_parse_warnings=False,
        doc={"toc": [], "blocks": []},
        plain_text="",
        synopsis=None,
        options=None,
        see_also=None,
        headings_text="",
        see_also_refs=[],
    )

    _resolve_doc_links_and_see_also(pages=[foo, bar])

    para = foo.doc["blocks"][0]
    missing_link = para["inlines"][3]
    assert missing_link["type"] == "link"
    assert missing_link["href"] == "/man/missing/1"
    assert missing_link["linkType"] == "unresolved"

    bar_link = para["inlines"][1]
    assert bar_link["type"] == "link"
    assert bar_link["href"] == "/man/bar/1"
    assert bar_link["linkType"] == "internal"

    resolved = {r["name"]: r.get("resolvedPageId") for r in (foo.see_also or [])}
    assert resolved["bar"] == str(bar_id)
    assert resolved["missing"] is None
